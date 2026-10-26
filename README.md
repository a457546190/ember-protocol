# 余烬协议 · Ember Protocol

一个完整可玩的 ECS 生存割草 Demo。深色荒野、自动武器、三选一进化、密集怪潮，以及最后的裂隙领主战。

[![Test, build and deploy Pages](https://github.com/a457546190/ember-protocol/actions/workflows/pages.yml/badge.svg)](https://github.com/a457546190/ember-protocol/actions/workflows/pages.yml)

TypeScript · Canvas 2D · 自定义 SoA ECS · 零运行时第三方依赖 · 桌面 / 手机 · MIT

## 直接游玩

**双击项目根目录的 `EmberProtocol.html`。** 图片、样式、代码和合成音效均已内置，可以离线游玩，无需安装依赖、启动服务器或联网。

开发预览：`http://127.0.0.1:5173/`（需要先启动下方的开发服务）。

在线游玩：**https://a457546190.github.io/ember-protocol/**。

离线版：[下载完整 HTML](https://a457546190.github.io/ember-protocol/EmberProtocol.html)（将页面保存为 HTML 后可直接打开）。

## 操作与目标

| 操作 | 按键 |
| --- | --- |
| 移动 | WASD / 方向键 |
| 攻击 | 自动瞄准和开火 |
| 闪避 | 空格，短暂无敌，2.5 秒冷却 |
| 选择强化 | 点击卡片 / 数字 1、2、3 |
| 暂停 / 继续 | Esc / P |
| 音效开关 | M |
| 性能面板 | F3 |
| 结算后重开 | R |
| 触屏 | 左下虚拟摇杆任意方向移动，右下按钮闪避；也可拖动空白区域移动 |

**生存至少 3 分钟，并击败裂隙领主即可获胜。** 领主在 02:30 出现；如果 03:00 时仍未击败它，战斗会继续，直至击败领主或角色死亡。领主登场时，场上尚未消失的余烬会自动向玩家汇聚。升级选择期间暂停战斗，切换窗口时自动暂停。

武器有脉冲步枪、公转环刃和连锁电弧。升级涵盖伤害、射速、弹道数量、环刃、电弧、移动、拾取、生命和回复。第一次升级保证提供三种武器方向。首局建议优先解锁环刃和电弧，保持移动，留意拾取青色余烬。

01:00 起，怪潮加入远程敌人「赤蕊喷射者」。它会保持距离，亮起红色瞄准线蓄力 0.7 秒，再朝锁定的方向发射红色弹丸；看到瞄准线后及时横移或闪避。普通远程怪与领主的敌方弹丸统一使用鲜红色，与玩家的金色脉冲弹区分。

公转环刃首次解锁为 **1 枚**，后续每级增加 1 枚，最高 5 枚；裂隙领主生命值为 **3600**（首版 1800 的两倍）。

## 本地开发

需要 Node.js 20.19+ 或 22.12+。

```sh
npm ci
npm run dev
```

```sh
npm run build         # 类型检查、生成 dist/、生成离线单文件 EmberProtocol.html
npm test              # ECS、碰撞、战斗、升级、Boss、完整对局的自动测试
npm run test:balance  # 三个固定随机种子的无作弊移动策略回放，用于观察平衡
npm run test:browser  # Chrome 浏览器交互测试；需要开发服务运行在 5173 端口
npm run test:offline  # 离线 HTML、真实触屏输入、横屏布局与高密度渲染压测
npm run test:mobile   # 可见摇杆、任意方向、多点触控闪避、松手/中断复位与横竖屏
npm run preview      # 预览 dist/ 生产构建
```

浏览器测试通过 Playwright 使用本机 Google Chrome，生成的桌面和手机截图位于 `test-results/`。开发环境如果没有 Chrome，可安装 Chrome，或修改测试的 `channel` 使用已有浏览器。

也可以检查已部署的网站：`node tests/browser-check.mjs https://a457546190.github.io/ember-protocol/`，手机触控检查使用 `node tests/mobile-check.mjs https://a457546190.github.io/ember-protocol/`。

## 技术结构

- `src/ecs.ts`：独立的 ECS 存储，实体 ID、组件位掩码、TypedArray SoA 数据、实体槽位复用与空间网格。
- `src/simulation.ts`：不依赖 DOM 的战斗模拟，固定 60 Hz；输入、刷怪、追击、武器、碰撞、伤害、拾取、升级与胜负。实体销毁延后到查询结束，避免遍历失效。
- `src/renderer.ts`：Canvas 2D 地形、角色、怪物、武器、特效、摄像机与震屏，支持高 DPI；地表与普通怪物动画帧缓存后重复绘制。
- `src/main.ts`：输入、触屏摇杆、状态界面、暂停、音效、个人最佳记录和固定步长调度。
- `src/audio.ts`：Web Audio 合成音效，由首次操作解锁。
- `src/touch.ts`：带死区与力度变化的 360 度虚拟摇杆输入。
- `src/style.css`：菜单、HUD、升级、结算与响应式布局。
- `tools/package.mjs`：将生产构建内联为可直接打开的离线 HTML。

没有运行时第三方依赖、外部字体、远程素材或网络请求。程序绘制所有视觉素材，模拟随机数可以固定种子，渲染不消耗战斗随机数。

`?debug` 参数只为开发检查暴露 `window.__ember` 状态桥，并默认开启性能面板。普通入口不暴露该桥。

这是单人 Demo：暂未实现存档续局、联机、手柄或大型地图内容。浏览器内保存音效偏好与最佳生存时间 / 击杀数；在禁用本地存储时仍可游玩。

## GitHub Pages 与自动部署

`.github/workflows/pages.yml` 在推送到 `main` 后自动安装锁定依赖、运行逻辑测试、执行 TypeScript 检查和生产构建，然后发布 `dist/` 到 GitHub Pages。Pull Request 只执行检查与构建；也可在 Actions 页面手动触发发布。

首次配置时，在仓库 **Settings → Pages → Source** 选择 **GitHub Actions**。部署只使用 GitHub 自动提供的工作流身份，不需要个人 Token、SSH 私钥或服务器密码。

`vite.config.ts` 使用相对资源路径，同一份 `dist/` 也可以放到其他静态文件服务器，支持域名根目录和子目录。服务器不需要 Node.js；Node.js 仅用于本地或 CI 构建。

## 开源许可

本项目使用 [MIT License](LICENSE)，可以学习、修改、分发和用于自己的项目，保留许可证要求的版权声明即可。游戏图形由程序绘制，音效由 Web Audio 合成。
