# 架构与约定

## 坐标系与单位

- 右手系 Three.js;**世界沿 +Z 展开**(骑行前进方向 ≈ +Z);单位:米
- 地形参数化为 `(z, lateral)`:顶点 `x = centerX(z) + lateral`
- **屏幕右 = 世界 -x**:物理里 `yaw -= steer * rate`(D 键屏幕右转),HUD 箭头的角度符号也据此处理
- 可玩走廊 `|lateral| ≤ 55`;崖壁在 55–120 m 抬升;横向软边界 ±118 m
- `z ∈ [0, 800]`,卷轴端头在 0 / 800 处

## 世界常量(`src/world/World.ts`、`Path.ts`)

- 中心线 `centerX(z)`:每 100 m 一个 Catmull-Rom 控制点,横向 ±25 m
- 河流:`riverZ(x) = 340 + 12·sin(0.03x)`,宽约 18 m;水面 y=-0.55,**河床压到 -0.9 的浅滩**,涉水只减速不重置
- 桥:z≈340,`|x-centerX(340)|<5.2`;桥面 y=2.4,`|dz|≤8` 为平台,8–26 m 为连续引桥坡道(`bridgeYAt`);栏板限制骑手在桥面内
- 五座亭台:z = 110 / 260 / 410 / 555 / 700,交替两岸(±40 m),地基半径 10 m 压平;基座碰撞半径 5.35 m
- 每区需 **3 次交付** 完成;每区目标色循环 石青/石绿/赭石;区域半径 40→95 m
- 一局限时 **480 s**;携带上限 **6**;光点重生 12 s
- 碰撞:峡谷走廊 `|lateral| ≤ 60` 软墙 + 陡坡减速;桥面栏板;卷轴端头;树木/山石无碰撞

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
    Path.ts               centerX / riverZ
    World.ts              heightAt / gradient / 区域与亭台 / 水与桥判定
    TerrainBuilder.ts     (z,lateral) 网格 + aRegion/aValley;makeOutlineGeometry
    Props.ts              松树/山石 InstancedMesh、亭台合并网格、桥、水面、卷轴端头
  render/
    Renderer.ts           渲染器、场景、雾、灯光
    SkyDome.ts            天穹渐变 + 云带 + 日晕
    Backdrop.ts           3 层远山视差圆柱壳(程序化山脊 + 墨线 + 雾)
    materials/ShanshuiMaterial.ts  地形/中景共用的青绿山水材质
  bike/
    BikePhysics.ts        120Hz 街机物理(加速/阻力/坡度/转向/跳跃/落水)
    BikeModel.ts          竹骨自行车 + 骑手 + 车筐颜料光
    CameraRig.ts          弹簧跟随、速度 FOV、防穿地
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
3. 地形 ribbon(`ShanshuiMaterial`)+ 反向外壳描边(可选 `?outline=0`)
4. 水面、桥、亭台、树/石 InstancedMesh、卷轴端头
5. 三色光点(一个 `THREE.Points` + 自定义 shader)
6. DOM 层 `#paper`:SVG 噪声绢纹 + 径向暗角(**替代合成 pass**)
7. 标准材质仍由 Hemisphere/Directional 光照;地形/远山用自定义 shader 自带光照

**区域上色**:纯 uniform(`uReveal[5]` / `uRevealR[5]` / `uRegionCenter[5]`),片元按噪声扰动距离混合墨底与颜料底;无 render target、无额外 draw call。reveal 与半径由 `Regions.updateRegions()` 做指数平滑。

**ShanshuiMaterial 要点**:墨线 = 两级高度等值线(`fract` + fbm 扰动,`smoothstep` 到 0 形成细线,距离淡出);披麻皴 = 沿坡向的 fbm streak;颜料分带 = 石绿底 + 石青山脊/陡坡 + 赭石斑块;金边 = 菲涅尔×海拔;雾 = 距离 smoothstep。

## 飞行与碰撞

- **起飞/收翼**:App 记录 Space 按下时间戳,1.2 s 内 ≥3 次 → 未飞行则 `bike.startFlying()`(vy=6.2,离地),飞行中则 `bike.stopFlying()`。
- **飞行物理**:`Space` 按住 → `vy → +7`;`S`(throttle<0)→ `vy → -9` 俯冲;否则 `vy → -2.4` 缓降;指数平滑,`y ≤ 100`;触地自动收翼。飞行时转向保留最低 0.4 灵敏度,坡度不再影响速度。
- **模型**:`BikeModel.setWings(active, phase)` 显示两片 DoubleSide 绢翼并做拍翅。
- **碰撞**:`World.resolveCollisions(pos, radius)` 把车推出亭台基座,并在桥面平台内限制横向;非飞行时走廊横向钳制 ±60,坡度 >0.5 开始强力减速、>1.1 基本挡停。
- **河流**:`heightAt` 河床 -0.9;`BikePhysics` 检测到浅水时持续减速并每 5 s 最多触发一次水声,不再重置位置。

## 角色与颜料

- **骑手**(`BikeModel.buildRider`):按材质合并的分层程序化模型——斗笠(帽檐/帽顶/帽箍)、交领、宽袖、束腰、裙摆、披风、两条围巾与腰带飘带、护腿、布鞋、发髻与发簪。披风/围巾/腰带的摆动在 `update()` 里按速度做 flutter。
- **翅膀**(`buildWings`):每侧 5 片渐变色羽片合并成一个几何;`vertexColors` 从羽根米白过渡到羽尖墨青;`setWings(active, phase)` 做拍翅。
- **颜料**(`Motes`):每颗由两个 InstancedMesh 组成——八面体宝石(MeshStandardMaterial + 每实例颜色)和实例化 billboard 光晕(手绘 CanvasTexture 径向光斑 + 十字星芒,每帧用相机四元数朝向)。总计 2 draw call。11 m 内磁吸(仅筐有空位时)、4.5 m 拾取、8 s 重生。
- **为什么不用 Points/自定义实例 shader**:Windows ANGLE 会把 `gl_PointSize` 限制到 1 px;自定义 InstancedBufferGeometry + ShaderMaterial 在当前环境也出现空绘制。Texture + InstancedMesh 是最稳的跨平台方案。

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

`?debug=1`、`?autostart=1`、`?reveal=1`、`?auto=1`、`?seed=42`、`?outline=0`、`?backdrop=0`、`?touch=1`。`auto` 会先找最近光点,凑够 3 个再去最近未完成亭台,用于回归验证主循环。`?debug=1` 时 `window.__qianli = { bike, world, scoring, motes, input }` 供 CDP 脚本做传送/飞行/碰撞/触屏测试(`temp/cdp-flight.mjs`、`temp/cdp-mobile.mjs`)。

## 决策记录

- **平面长卷而非弯曲世界**:弯曲拖累物理/相机,纵深交给雾与分层剪影。
- **程序化山水而非原画贴图**:本机取不到扫描件,且更原创;保留 `public/scroll.webp` 槽位。
- **uniform 上色而非遮罩贴图**:零额外 draw call,所有材质共用同一逻辑。
- **竹骨自行车**:保留 riding game 身份符号,与宋画形成刻意的时代错位。
- **每区 3 次交付**:4 次在 8 分钟内难以完成全部 5 区,3 次更可玩。
- **CSS 绢纹替代 bloom 合成**:先保证稳定与性能;合成 pass 留作后续升级。
- **转向方向**:相机在车后看 +Z 时屏幕右是世界 -x,物理转向符号已按此校正。
- **河流保留但改浅滩**:水是《千里江山图》的核心意象,直接删掉损失太大;改为浅滩涉水 + 可靠石桥,消除落水重置的卡顿。
- **飞行采用三连跳**:沿用参考站的心智模型;Space 上升、S 下降、三连 Space 收翼,避免“飞上去下不来”。
- **树木不碰撞**:600+ 棵树逐个做碰撞不划算,且会打断骑行节奏;用走廊软墙和亭台/桥栏提供“实体感”。
- **颜料用 InstancedMesh + 贴图光晕**:避开 `gl_PointSize` 在 ANGLE 下被限制为 1 px 的坑;宝石核心给实体感,光晕给远距离可读性。
