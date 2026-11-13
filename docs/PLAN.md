# 青绿山水骑行原型(工作名:《设色千里》)实施计划

> 注:后续迭代已把世界从 800m 的 U 形峡谷长卷改为约 1120×1120 m 的开阔山丘草甸(26 座可骑山丘、亭台上山、移除河流/石桥)。当前实现以 `ARCHITECTURE.md` 与 `STATUS.md` 为准。

## Context

用户想复刻 starrynightrider.com 的"骑行 + 收集光点 + 地标交付"体验,但要求换一张公版画作、换一套完全不同的渲染范式,避免成为梵高笔触的衍生品。已选定王希孟《千里江山图》(1113,公有领域),确认三项决策:

1. 载具:**竹骨自行车**(器型冲突是刻意记忆点)
2. 核心钩子:**设色还山**——世界开场是宣纸白描,收集石青/石绿/赭石光点送到亭台后,周边区域逐渐上色,"边玩边把长卷画出来"
3. 范围:**单人可玩原型**(骑行 + 收集 + 交付 + 上色 + 本地排行榜),不做多人/NPC/后端

网络限制:本机访问不了 Wikimedia 等图源,原型**不依赖原画扫描件**,山水全部程序化生成;预留 `public/scroll.webp` 槽位,用户日后可自行放入 PD-Art 扫描版。画作本身公版;代码、名称、角色造型必须原创。

**MVP 验收**:打开页面 → "入画" → 在约 800m 峡谷长卷中骑行,收集三种颜料光点 → 送达 5 座亭台,区域逐步上色 → 全部完成或 8 分钟结束 → 结算 + localStorage 最佳分。桌面 Chrome 60fps,draw calls < 40。

## 技术栈与工程结构

`Vite + TypeScript + Three.js`,DOM overlay 做 UI,不引入 React;`lil-gui` 仅 dev 依赖用于调 shader。GLSL 以 TS 模板字符串内联,不引 glsl 插件。

```
package.json  vite.config.ts  tsconfig.json  index.html
public/                      # 可选 scroll.webp、favicon
src/
  main.ts  app.ts            # RAF 循环、resize、挂载
  core/    GameState.ts Input.ts PRNG.ts MathUtils.ts Debug.ts
  world/   World.ts Path.ts TerrainBuilder.ts Bridge.ts
           Landmarks.ts Props.ts ScrollEdges.ts
  render/  Renderer.ts CompositePass.ts Backdrop.ts
           materials/ ShanshuiMaterial.ts InkHullMaterial.ts
                      WaterMaterial.ts MoteMaterial.ts
           shaders/   common.glsl.ts terrain.frag.ts backdrop.frag.ts
                      water.frag.ts composite.frag.ts
           textures/  PaperTexture.ts
  bike/    BikePhysics.ts BikeModel.ts CameraRig.ts
  game/    RunManager.ts Regions.ts Motes.ts Delivery.ts Scoring.ts Leaderboard.ts
  ui/      Hud.ts TitleScreen.ts FinishScreen.ts Minimap.ts Toast.ts styles.css
```

脚本:`dev` / `build` / `preview` / `typecheck`。依赖:`three`(r170+,安装时锁版本)、`vite`、`typescript`。

## 世界表示

**平面可骑行的"长卷带"**(不做物理弯曲世界):250m 宽 × 800m 长的条带沿 +Z 展开,深度感交给雾气与分层剪影,避免弯曲地形拖累物理和相机。

- `Path.ts`:7 个控制点的 Catmull-Rom 中心线(横向 ±25m 摆动),按 1m 弧长采样;河流是反向摆动的第二条折线,宽 14m。
- `World.heightAt(x,z)` 解析函数,网格与物理共用:
  1. 原始高度 base = 1–3m + `fbm2(x*.012,z*.012)*6`(前山遮罩)
  2. 河谷:`|distToRiver|<8` 时压到 -2.5m,岸坡过渡
  3. 峡谷壁:`smoothstep(55,110,|lateral|)^1.8 * 90`,可玩走廊 `|lateral|<60`
  4. 亭台地基:半径 10m 内按 pad 高度平滑压平
  5. 桥面:矩形查询返回桥面高度(s≈340 处过河)
- `TerrainBuilder.ts`:在 `(s, lateral)` 上以 2m / 2.5m 采样 ribbon 网格,单 draw call;attributes: position、normal、`aRegion`(最近亭台区域 0–4)、`aValley`(谷底遮蔽)。
- 摆放:`mulberry32` 种子 PRNG;树木/山石按 8m 抖动网格 + 噪声密度剔除,避开河道、陡坡、亭台、桥与骑行走廊;5 座亭台在 s = 110/260/410/555/700,交替两岸。
- 卷轴边缘:s=0 与 s=800 各放一个立起的卷轴/锦缎端头,雾气幕遮挡;横向软钳制 `|lateral|=125`,到头时速度反向。
- 碰撞:落地吸附 `heightAt`;坡度 >0.9 时速度水平投影(贴墙滑);桥栏和亭台基座用胶囊/AABB 推出;落水回最近检查点。

## 渲染管线(重点)

单 Renderer,sRGB 输出,DPR 上限 2,最终 compositing 里做调色。约 20 个 draw call,层序:

1. **L0 绢本天幕**:相机锁定全屏面片,暖绢底色 + 云带,可选采样 `scroll.webp`
2. **L1 远山视差**:4 层圆柱壳(r=300/500/800/1200),shader 用峰函数叠加 + 噪声生成山脊剪影,脊下填分层颜色(越远越淡),`fwidth` 画墨线,底部溶进雾里
3. **L2 中景低模山**:合并网格,顶点按高度分带(石青顶/石绿腰/赭石脚)+ 反向外壳描边(InkHull, BackSide, 法线外扩)
4. **L3 地形带**:`ShanshuiMaterial` + 近处崖壁反向外壳描边
5. **L4 水**:单平面,流线 + 金箔反光 + 雾带;桥/亭台合并组;松树 InstancedMesh;卷轴端头
6. **L5 光点**:三种颜料各一个 InstancedMesh,顶点 shader 里浮动/呼吸发光;雾气 billboard 一个 instanced draw
7. **L6 合成**:全屏 pass——亮部阈值 + 1/4 分辨率两次模糊做金色 bloom、绢纹颗粒、暗角、未上色区域轻微去饱和、对比度。预算不足时 bloom 第一个砍

**ShanshuiMaterial**(地形/中景/道具共用,defines 区分)关键 uniforms:
`uTime`、`uReveal[5]`、`uRevealR[5]`、`uRegionCenter[5]`、`uPigA/uPigB/uPigC`(石青 #3f6ea6 / 石绿 #4f8a63 / 赭石 #a05c33)、`uInk`、`uSilk`、`uGold`、雾参数、`uMistY`、`uContourScale`、`uGrain`。

Fragment 要点:
- 未上色态:绢色墨灰,掺 5% 青绿;上色后按坡度/高度分石青-石绿-赭石色带,噪声打散边缘
- 披麻皴:沿坡向各向异性拉伸 fbm 采样,压暗进墨色
- 墨线:高度等值线 `fract` 带状 + 噪声扰动,`fwidth`/距离淡出防摩尔纹
- 绢纹:哈希细纹理;雾 + 山脚雾;山脊处金色边缘光

**区域上色(核心机制)**:不用 render target,纯 uniform。顶点传 `aRegion`;fragment 计算
`r = max_i( uReveal[i] * smoothstep(uRevealR[i], 0, distNoiseWarp(worldXZ, uRegionCenter[i])) )`,
再 `mix(墨底, 颜料底, r)`。每次交付 `uReveal[i]` 1.2s 内 0→1、`uRevealR[i]` 扩到 90m;噪声扰动让上色边界呈水墨晕开的有机形状。地形、道具、中景生效方式一致,零额外 draw call。

## 骑行

- `BikePhysics.ts`:固定 120Hz 子步的街机模型。状态 `{pos, yaw, speed, steer, slip, vy, grounded}`;油门加速度、`-0.6v²` 阻力、沿坡力;转向率随速度 `clamp(speed/6,0,1)`;视觉 lean 由 yawRate×speed 得出;Shift 漂移(侧滑随抓地力衰减);Space 跳跃 + 重力 + `heightAt` 落地;pitch/roll 取前方/左侧 ±1.5m 地形差分。极速约 14m/s,下坡增益。
- `CameraRig.ts`:弹簧阻尼跟随平滑航向、前视 4m、FOV 60→76 随速度、roll = lean×0.4、地形/崖壁防穿插。
- `Input.ts`:统一 `{steer, throttle, drift, jump}`,键盘(WASD/方向键 + Shift + Space)与触屏摇杆都实现同一接口。
- `BikeModel.ts`:纯程序化几何——竹节车架(微弯圆柱 + 竹节环)、铜件车把/花鼓、辐条车轮(合并几何、每帧旋转)、车筐随携带颜料发光。暴露 lean/转向枢轴。

## 游戏系统

- **光点** `Motes.ts`:3 类,每区域 3–5 簇、约 18–25 个,同屏上限 90;拾取半径 2.5m;12s 重生;浮动相位进 shader。
- **交付** `Delivery.ts`:亭台触发半径 6m;携带上限 6;结算分 = Σ基础分(石青150/石绿120/赭石100)× combo × 1.5(若包含该亭台"求"的颜色,上方横幅提示)。
- **计分** `Scoring.ts`:20s 内连续交付 combo +0.5×,上限 5×;HUD 显示倍率环。
- **区域** `Regions.ts`:每区需 4 次交付事件才到 reveal 1.0,每次 +0.25 并播放上色扩散;5 区全满或 8 分钟结束。
- **状态机** `GameState.ts`:`Boot → Title → Playing → Finishing → Finished`;更新顺序:输入 → 物理 → 触发/拾取 → 交付/上色动画 → 相机 → HUD → 渲染。
- **UI**:DOM overlay——三色颜料计数 + 容量格、combo、最近未完成亭台的方向箭头、2D canvas 小地图(长卷、亭台按 reveal 着色、玩家点)、toast("设色 · 青峦")、标题"入画"、结算(分数/用时/最佳)。
- **排行榜** `Leaderboard.ts`:localStorage `qianli_best_v1` 存前 5。

## 实施阶段

| 阶段 | 内容 | 验收 | 占比 |
|---|---|---|---|
| P0 | 脚手架、Renderer、ribbon 地形 + `heightAt`、自行车 + 跟随相机(纯绢色) | 能骑、能跳、不穿地,60fps | 15% |
| P1 | 中心线/河/崖壁/桥/碰撞/种子化树木与亭台/卷轴端头 | 过桥、贴墙滑、`?seed=42` 布局可复现 | 20% |
| P2 | ShanshuiMaterial、远山壳、水、描边、合成 pass;`?shader=1` 独立预览;lil-gui 调参 | 层次清晰、墨线运动稳定不闪 | 30% |
| P3 | 光点、容量、交付、上色动画、计分/combo、胜利条件 | 收集→交付→区域可见上色 | 20% |
| P4 | HUD、小地图、指南针、标题/结算、localStorage | 刷新后最佳分仍在 | 10% |
| P5 | 雾气粒子、金色 bloom 调优、可选简单音效、性能收尾 | ≥58fps,draw calls <40 | 5% |

## 风险与对策

- **程序化山水显廉价(最大风险)**:调色板锁 5 色以内、强化前中远景明度层次、山脚重点用雾遮断、全局绢纹;P2 先单座山试验通过再铺开
- **shader 调试成本**:每个 shader ≤120 行,基础材质验收前不加后处理,lil-gui 暴露全部 uniform
- **性能**:draw calls <40、共享材质、重复物全部 instancing、DPR≤2、限制雾 overdraw;每阶段看 `renderer.info`
- **描边瑕疵**:只给近景高价值网格做反向外壳;屏幕空间描边明确排除
- **范围蔓延**:MVP 清单冻结,特技/NPC/多人/后端一律不进第一版
- **触屏**:MVP 后置,但 Input 抽象第一天就留好

## 验证

`npm run dev` → `http://localhost:5173`。
- P0:上下坡、跳跃、贴地无穿插;`?debug=1` 显示 draw calls/帧时间
- P1:桥面、崖壁推出、种子布局复现
- P2:出生点能看到 4 层纵深;快速移动时墨线不闪烁;上色边界像墨晕
- P3:拾取/交付/计分正确,区域 reveal 递增,5 区完成触发结算
- P4:刷新保留最佳分;小地图/箭头方位与世界一致
- P5:Chrome Performance ≥58fps、draw calls <40、无 GC 尖峰

## 执行方式

实施时用任务列表跟踪 P0–P5,按阶段连续推进;删除或强制类操作先确认再执行。
