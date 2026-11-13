# 架构与约定

## 坐标系与单位

- 右手系 Three.js;世界是 x/z 对齐的正方形草甸,中心 (0,0),范围 **±560 m**;单位:米
- 地形参数化为 `(x, z)` 网格;主网格 6 m 步长,描边用 12 m 粗网格
- **屏幕右 = 世界 -x**:物理里 `yaw -= steer * rate`(D 键屏幕右转),HUD 箭头的角度符号也据此处理
- 可玩边界 ±542 m;半径 470 m 外抬升为环形远山(边界 560 m 处 +180 m),超出后靠雾与陡坡收边

## 世界常量(`src/world/World.ts`)

- **26 座可骑山丘**:半径 55–150 m,高度 8–42 m;低丘与高丘错落,山肩坡度控制在约 0.47 以内,可从任意方向骑到山顶
- 前 5 座山丘的顶上是五座亭台(交付点),山顶地基半径 8–16 m 压平;基座碰撞半径 5.35 m
- 其余山丘顶部立一面小旗,标记可骑达的山顶
- 每区需 **3 次交付** 完成;每区目标色循环 石青/石绿/赭石;区域半径 40→95 m
- 一局限时 **480 s**;携带上限 **6**;光点重生 8 s
- 碰撞:边界钳制 ±542 m;坡度 >0.5 强力减速、>1.1 基本挡停;亭台基座推出;树木/山石无碰撞
- 河流与石桥已移除,当前地图只有草甸、山丘与环形远山

## 模块(实际实现)

```
src/
  main.ts / app.ts        入口、装配、状态机、主循环、结算
  core/
    MathUtils.ts          clamp/lerp/smoothstep/damp/wrapAngle/hash/value noise/fbm/Catmull-Rom
    PRNG.ts               mulberry32、URL 种子
    Input.ts              键盘输入(steer/throttle/boost/jump)
    Sfx.ts                WebAudio 程序化音效
    Debug.ts              ?debug=1 面板
  world/
    World.ts              方形山丘草甸 heightAt / gradient / 山丘与山顶亭台
    TerrainBuilder.ts     (x,z) 方形网格 + aRegion/aValley;makeOutlineGeometry
    Props.ts              多树种/草丛/野花/山石、山顶亭台、summit 小旗、风摆
  render/
    Renderer.ts           渲染器、场景、雾、灯光
    SkyDome.ts            天穹渐变 + 云带 + 日晕
    Backdrop.ts           3 层远山视差圆柱壳(程序化山脊 + 墨线 + 雾)
    materials/ShanshuiMaterial.ts  地形/中景共用的青绿山水材质
  bike/
    BikePhysics.ts        120Hz 街机物理(加速/阻力/坡度/转向/跳跃/落水)
    BikeModel.ts          高细节竹骨车 + 分层骑手 + 骨骼 IK + 布料模拟 + 翅膀
    ProceduralTextures.ts 竹/草编/织物/皮革/黄铜/藤编/纸张/光晕 CanvasTexture
    ViewController.ts     鼠标拖拽 / 触屏视角盘 → 相机偏航/俯仰偏移
    CameraRig.ts          球形跟随、速度 FOV、防穿地(距离 5.4 m)
  game/
    Pigments.ts           三色定义/容量/每区交付数
    Motes.ts              GPU Points 光点(1 draw call)+ 拾取/重生
    Scoring.ts            携带/得分/combo
    Regions.ts            区域 reveal 与半径动画
    Leaderboard.ts        localStorage 前 5
  ui/
    Hud.ts                计数/携带/combo/计时/分数/指引/toast
    Minimap.ts            2D canvas 小地图
    styles.css            DOM UI、绢纹颗粒与暗角(#paper)、卷轴标题
```

## 主循环

```
input → (可选 autopilot) → 物理固定 120Hz → 拾取 → 交付 → 上色/计分动画 → 相机 → HUD/小地图 → 渲染
```

`dt` 上限 50 ms;渲染每帧调用 `shanshui.sync()` 与 `backdrop/sky.update()`。

## 渲染管线(现状)

1. SkyDome(相机锁定,`depthTest:false`,renderOrder -30)
2. 远山视差 3 层圆柱壳(`depthWrite:false`,renderOrder -10…-8)
3. 方形地形网格(`ShanshuiMaterial`)+ 粗网格反向外壳描边(可选 `?outline=0`)
4. 多树种 InstancedMesh、跟随玩家的草丛毯、全场草丛/野花/成簇山石、山顶亭台与 summit 小旗
5. 三色光点(八面体 InstancedMesh + 实例化 billboard 光晕贴图)
6. DOM 层 `#paper`:SVG 噪声绢纹 + 径向暗角(**替代合成 pass**)
7. 标准材质仍由 Hemisphere/Directional 光照;地形/远山用自定义 shader 自带光照

**区域上色**:纯 uniform(`uReveal[5]` / `uRevealR[5]` / `uRegionCenter[5]`),片元按噪声扰动距离混合墨底与颜料底;无 render target、无额外 draw call。reveal 与半径由 `Regions.updateRegions()` 做指数平滑。

**ShanshuiMaterial 要点**:墨线 = 两级高度等值线(`fract` + fbm 扰动,`smoothstep` 到 0 形成细线,距离淡出);披麻皴 = 沿坡向的 fbm streak;颜料分带 = 石绿底 + 石青山脊/陡坡 + 赭石斑块;金边 = 菲涅尔×海拔;雾 = 距离 smoothstep。

## 飞行与碰撞

- **起飞/收翼**:App 记录 Space 按下时间戳,1.2 s 内 ≥3 次 → 未飞行则 `bike.startFlying()`(vy=6.2,离地),飞行中则 `bike.stopFlying()`。
- **飞行物理**:`Space` 按住 → `vy → +7`;`S`(throttle<0)→ `vy → -9` 俯冲;否则 `vy → -2.4` 缓降;指数平滑,`y ≤ 100`;触地自动收翼。飞行时转向保留最低 0.4 灵敏度,坡度不再影响速度。
- **模型**:`BikeModel.setWings(active, phase)` 显示两片 DoubleSide 绢翼并做拍翅。
- **碰撞**:`World.resolveCollisions(pos, radius)` 把车推出亭台基座;边界钳制 ±542 m;坡度 >0.5 开始强力减速、>1.1 基本挡停(环形远山因此不可翻越)。

## 模型细节

- **自行车**:Catmull-Rom + TubeGeometry 竹管带微弯;竹节环、铜箍/铜球接头、关节缠绳;挡泥板与撑杆;后货架;皮革鞍座 + 螺旋弹簧 + 铜铆钉;卷轴筒;藤筐(贴图 + 竹条格栅 + 皮绑带);打气筒;鞍袋;车铃;刹车线与护套;链条;挂在前把的纸灯笼(Sprite 光晕 + 自发光);24 根辐条、轮毂/法兰、轮圈/轮胎。
- **骑手**:LatheGeometry 躯干/裙摆带径向褶皱;交领、束腰、玉佩;白发髻/发簪/面部小部件;草帽带竹筋与帽箍、下颌绳;肩披 + 披风 + 围巾 + 腰带四层布料,每帧做 CPU 顶点波动并重算法线;深色护腿与布靴。
- **动画**:踩踏用两段骨骼 IK(髋→脚蹬目标,膝盖朝前);手臂同样用 IK 追把手(随转向组旋转);关节/手/靴用 InstancedMesh 更新矩阵;车轮、曲柄、踏板、灯笼、身体前倾/转头都有动态。
- **材质**:CanvasTexture 颜色 + 同图 bumpMap;织物/木/藤/纸双面;黄铜使用 metalness,并在 Renderer 用 RoomEnvironment + PMREM 提供环境反射(`environmentIntensity 0.32`)。
- **检视模式**:`?model=1` 隐藏 HUD,模型原地以 5.5 m/s 踩踏,相机环绕 3.15 m;`?wings=1` 展开翅膀。正常游戏相机距离 5.4 m。

## 角色与颜料

- **骑手**(`BikeModel.buildRider`):按材质合并的分层程序化模型——斗笠(帽檐/帽顶/帽箍)、交领、宽袖、束腰、裙摆、披风、两条围巾与腰带飘带、护腿、布鞋、发髻与发簪。披风/围巾/腰带的摆动在 `update()` 里按速度做 flutter。
- **翅膀**(`buildWings`):每侧 5 片渐变色羽片合并成一个几何;`vertexColors` 从羽根米白过渡到羽尖墨青;`setWings(active, phase)` 做拍翅。
- **颜料**(`Motes`):每颗由两个 InstancedMesh 组成——八面体宝石(MeshStandardMaterial + 每实例颜色)和实例化 billboard 光晕(手绘 CanvasTexture 径向光斑 + 十字星芒,每帧用相机四元数朝向)。总计 2 draw call。11 m 内磁吸(仅筐有空位时)、4.5 m 拾取、8 s 重生。
- **为什么不用 Points/自定义实例 shader**:Windows ANGLE 会把 `gl_PointSize` 限制到 1 px;自定义 InstancedBufferGeometry + ShaderMaterial 在当前环境也出现空绘制。Texture + InstancedMesh 是最稳的跨平台方案。

## 植被与地表

- **树木**:松(5 层锥冠 + 树干)、阔叶(树干 + 5 个 Icosahedron 冠团)、竹(6 秆 + 叶片)、灌木;按高度/噪声选型,噪声密度成簇;统一用 `onBeforeCompile` 注入顶点风摆(以实例原点为相位),材质为 flatShading + vertexColors + 实例色。
- **草丛**:3 面交叉 `PlaneGeometry` + 程序化 CanvasTexture(草叶 + 少量花点),alphaTest;桌面 4500 簇全场 + 6000 簇近身"草毯"(10 m 世界网格锚定,跟随玩家,跨格才重算矩阵);触屏按 0.6 细节缩放。
- **野花**:实例化小八面体,白/金/青/赭四色。
- **山石**:两种顶点抖动的低模岩体,顶部染苔;按 55 个簇中心、每簇 4–14 块分布。
- **地表 shader**:平地混入草绿、草叶条纹、野花点、卵石点与泥土斑;坡面带岩石纹理;平地等高线强度降低,避免大片条纹。
- **性能**:植被占用约 200k 三角面;触屏把树/草/花/石数量乘 0.6。`?overview=1` 可俯瞰。

## 自由视角

- `ViewController` 维护 `yaw/pitch` 当前值与目标值:
  - 鼠标/触屏在 canvas 上按住拖拽 → 直接累加目标偏航/俯仰(灵敏度 0.0038/0.0052)。
  - 触屏右下「视角」盘 → 摇杆偏移量驱动角速度(偏航 1.8 rad/s、俯仰 1.15 rad/s)。
- 限制:偏航 ±2.5 rad,俯仰 -0.38…0.70 rad。
- 回正:松手 1.2 s 后且车速 >2 m/s 时,目标值按指数缓慢回零;停车时保持视角便于环顾。
- `CameraRig` 用 `phi = 0.18 + pitch` 的球坐标绕自行车(半径 5.4 m)布置相机,朝向 `pivot + forward(yaw)*3.2`;相机高度仍做地形防穿。`ViewController` 已在 `__qianli` 调试对象里暴露。

## 移动端

- **检测**:`TouchControls.isTouchCapable()`(`pointer: coarse` 或 `maxTouchPoints > 0`)或 `?touch=1` 强制;检测到后给 `<body>` 加 `.touch`,切换提示文案并显示触屏控件。
- **输入合并**:`TouchControls` 把摇杆位移按半径归一化(0.10 死区)写入 `Input` 的触屏轴;「疾/降/跃」是按住式按钮;「跃」按下时调用 `input.pressJump()`,三连点复用 App 现有起飞/收翼逻辑,按住则 `ascend = true`。`Input.sample()` 把键盘与触屏的 steer/throttle 相加后 clamp,boost/ascend 取或;切回标题/结算时调用 `resetTouch()`。
- **画质档**:`Renderer` 的 `maxPixelRatio` 触屏为 1.5;`ShanshuiMaterial(lowQuality=true)` 用 defines 把 `FBM_OCTAVES` 降到 2,并跳过第二层等高线。
- **布局**:`html/body/#gl` 用 `100dvh`(保留 100vh 回退);控件与 HUD 使用 `env(safe-area-inset-*)`;触屏隐藏小地图;右下按钮横排(疾/降/跃),左下 132px 摇杆。开始游戏时尝试 `requestFullscreen()`(iOS 可能不支持)。
- **测试**:桌面用 `?touch=1` 强制控件;CDP `Input.dispatchTouchEvent` 可直接驱动摇杆和按钮。

## 交付指引

- 顶部 `#objective`:当前最近未完成亭台 + 请求色 + 距离(持有颜料时显示“交付”,否则“拾颜料”)。
- 底部 `#guide`:指向目标的箭头 + 名称/请求色/距离,可交付时追加“可交”。
- 小地图:玩家到目标的虚线、目标脉冲环、“交”字标记,亭台点按请求色显示、透明度随 reveal 增加。
- 世界:目标亭台上方 100 m 金色光柱(脉动透明度),完成全部区域后隐藏。

## 调试参数

`?debug=1`、`?autostart=1`、`?reveal=1`、`?auto=1`、`?seed=42`、`?outline=0`、`?backdrop=0`、`?touch=1`、`?model=1`、`?wings=1`、`?overview=1`。`auto` 会先找最近光点,凑够 3 个再去最近未完成亭台,用于回归验证主循环。`?debug=1` 时 `window.__qianli = { bike, world, scoring, motes, input }` 供 CDP 脚本做传送/飞行/碰撞/触屏测试(`temp/cdp-flight.mjs`、`temp/cdp-mobile.mjs`、`temp/cdp-model.mjs`)。

## 决策记录

- **开阔山丘而非 U 形峡谷**:参考站用街道房屋铺满地图,本项目用高低错落、可骑到顶的山丘替代;地图扩到约 1120×1120 m,河流/石桥/卷轴端头移除,五座亭台移到山顶。
- **近身草毯而非全图铺草**:全图铺满高密度草会拖垮性能,改为全场稀疏草 + 跟随玩家的 10 m 网格草毯,保证近景密度。
- **程序化山水而非原画贴图**:本机取不到扫描件,且更原创;保留 `public/scroll.webp` 槽位。
- **uniform 上色而非遮罩贴图**:零额外 draw call,所有材质共用同一逻辑。
- **竹骨自行车**:保留 riding game 身份符号,与宋画形成刻意的时代错位。
- **每区 3 次交付**:4 次在 8 分钟内难以完成全部 5 区,3 次更可玩。
- **CSS 绢纹替代 bloom 合成**:先保证稳定与性能;合成 pass 留作后续升级。
- **转向方向**:相机在车后看 +Z 时屏幕右是世界 -x,物理转向符号已按此校正。
- **飞行采用三连跳**:沿用参考站的心智模型;Space 上升、S 下降、三连 Space 收翼,避免“飞上去下不来”。
- **树木不碰撞**:900+ 棵树逐个做碰撞不划算,且会打断骑行节奏;用陡坡与边界提供“实体感”。
- **颜料用 InstancedMesh + 贴图光晕**:避开 `gl_PointSize` 在 ANGLE 下被限制为 1 px 的坑;宝石核心给实体感,光晕给远距离可读性。
