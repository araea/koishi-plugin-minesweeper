import { Context, Schema, h, sleep, Logger } from 'koishi'
import puppeteer, { Browser, Page } from "puppeteer-core"
import crypto from 'crypto'
import find from 'puppeteer-finder'

export const name = 'minesweeper'
export const logger = new Logger('扫雷')
export const usage = `## 🌠 后续计划

* 🤖 夜间模式、扫雷难度设置

## 🎮 使用

- 请确保你能够打开这个网站 [JS Minesweeper (zwolfrost.github.io)](https://zwolfrost.github.io/JSMinesweeper/)

- 注意：可以一次翻开多个单元格，用逗号(中英文均可)或空格分隔，如 \`minesweeper.open 0,66,11\`

## ⚙️ 配置

\`isEnableImageCompression\`：是否压缩图片，默认为 false

\`PictureQuality\`：压缩后图片的质量，1-100，默认为 80

### 📝 命令

使用以下命令来玩扫雷游戏：

- \`minesweeper\`：显示扫雷帮助信息
- \`minesweeper.start\`：开始扫雷游戏，会显示一个扫雷网格，每个单元格有一个编号
- \`minesweeper.stop\`：停止扫雷游戏，会清除当前的游戏状态和排行榜
- \`minesweeper.restart\`：重新开始扫雷游戏，会重置当前的游戏状态和排行榜，并显示一个新的扫雷网格
- \`minesweeper.open <cell>\`：翻开所选单元格，如 \`minesweeper.open 10\` 表示翻开编号为 10 的单元格。如果翻开的单元格有数字，表示周围有多少个雷；如果翻开的单元格是空白，表示周围没有雷；如果翻开的单元格是地雷，表示游戏失败。可以一次翻开多个单元格，用逗号(中英文均可)或空格分隔，如 \`minesweeper.open 0,66,11\`
- \`minesweeper.flag <cell>\`：标记或取消标记可能有雷的地方，如 \`minesweeper.flag 55\` 表示在编号 55 的单元格上放一个旗子。如果该单元格已经被标记，则取消标记。可以一次标记或取消标记多个单元格，用逗号或空格分隔，如 \`minesweeper.flag 76，43，31\`
- \`minesweeper.hint\`：获取扫雷提示，会在一个未翻开且没有雷的单元格上显示一个问号
- \`minesweeper.rank\`：查看扫雷排行榜，会显示前十名玩家的昵称和积分。每翻开一个没有雷的单元格，积分加一；每翻开一个有雷的单元格，积分减一。
- \`minesweeper.set <difficulty>\`：设置扫雷难度（暂未实现），难度系数为 1-100 的整数，数值越大难度越高。`

export interface Config {
    isEnableImageCompression: boolean
    PictureQuality: number
}

export const Config: Schema<Config> = Schema.intersect([
    Schema.object({
        isEnableImageCompression: Schema.boolean().default(false).description('是否压缩图片'),
    }).description('基础配置'),
    Schema.union([
        Schema.object({
            isEnableImageCompression: Schema.const(true).required(),
            PictureQuality: Schema.number().min(1).max(100).default(80).description('压缩后图片的质量(1-100)'),
        }),
        Schema.object({}),
    ])
]) as Schema<Config>

// TypeScript 用户需要进行类型合并
declare module 'koishi' {
    interface Tables {
        minesweeper_games: MinesweeperGames
        minesweeper_rank: MinesweeperRank
    }
}

// 拓展表接口
export interface MinesweeperGames {
    id: number
    guildId: string
    isStarted: boolean
}
export interface MinesweeperRank {
    id: number
    userId: string
    userName: string
    score: number
}

// puppeteer-finder模块可以查找本机安装的Chrome / Firefox / Edge浏览器
const executablePath = find();
// ID
const GAME_ID = 'minesweeper_games'
const RANK_ID = 'minesweeper_rank'
// msg
const msg = {
    isStarted: '扫雷游戏已经开始啦~ 喵~',
    isNotStarted: '扫雷游戏还未开始喵~',
    isStopped: '扫雷游戏停止啦~ 喵~',
    error: '出错啦~ 喵~',
    fail: '很遗憾喵~ 你们输掉了~ ~',
    success: '哇喔~ 你们赢啦~ 喵！~',
    going: '继续加油喵~',
}

export function apply(ctx: Context, config: Config) {
    // 过滤上下文，仅群聊可用
    ctx = ctx.guild()
    // 拓展表
    extendTables(ctx)
    // 注册 Koishi 指令
    registerAllKoishiCommands(ctx, config)
}

function extendTables(ctx: Context) {
    // 拓展 Minesweeper 游戏管理表
    ctx.model.extend('minesweeper_games', {
        // 各字段类型
        id: 'unsigned',
        guildId: 'string',
        isStarted: 'boolean',
    }, {
        // 使用自增的主键值
        autoInc: true,
    })

    // 拓展 Minesweeper 排行榜表
    ctx.model.extend('minesweeper_rank', {
        // 各字段类型
        id: 'unsigned',
        userId: 'string',
        userName: 'string',
        score: 'integer',
    }, {
        // 使用自增的主键值
        autoInc: true,
    })
}


function registerAllKoishiCommands(ctx: Context, config: Config) {

    // minesweeper start stop restart open 提示 标记

    // minesweeper
    ctx.command('minesweeper', '扫雷帮助')
        .action(async ({ session }) => {
            await session.execute(`minesweeper -h`)
        })
    // start
    ctx.command('minesweeper.start', '开始扫雷')
        .action(async ({ session }) => {
            const gameInfo = await getGameInfo(ctx, session.guildId)
            if (gameInfo.isStarted) {
                return msg.isStarted
            }
            const result = await showIds(session.guildId)
            return h.image(result, 'image/png');
        })
    // stop
    ctx.command('minesweeper.stop', '停止扫雷')
        .action(async ({ session }) => {
            const gameInfo = await getGameInfo(ctx, session.guildId)
            if (!gameInfo.isStarted) {
                return msg.isNotStarted
            }
            await ctx.model.set(GAME_ID, { guildId: session.guildId }, { isStarted: false })
            const savedPage = pageMap.get(session.guildId);
            savedPage.close();
            return msg.isStopped
        })
    // restart
    ctx.command('minesweeper.restart', '重新开始扫雷')
        .action(async ({ session }) => {
            const gameInfo = await getGameInfo(ctx, session.guildId)
            if (!gameInfo.isStarted) {
                return msg.isNotStarted
            }
            const savedPage = pageMap.get(session.guildId);
            if (!savedPage) {
                return msg.error
            }
            const smileElement = await savedPage.$('#smile'); // 获取元素
            await smileElement.click(); // 模拟鼠标点击
            // 调用 addIds 函数，在页面上添加 id
            await addIds(savedPage);
            // 调用 removeIds 函数，在页面上移除 id
            await removeIds(savedPage);
            // 等待页面上的元素加载出来，指定选择器和超时时间
            // 这里使用了CSS选择器，匹配id为0或1的td元素下的div元素，并且div元素的style属性包含font-size和color
            await savedPage.waitForSelector('td[id="0"] > div[style*="font-size"][style*="color"], td[id="1"] > div[style*="font-size"][style*="color"]', { timeout: 3000 });

            // 调用 screenshotPage 函数，截图保存结果
            const screenshot = await screenshotPage(savedPage);
            return h.image(screenshot, 'image/png')
        })
    // open
    ctx.command('minesweeper.open <cell:text>', '翻开所选单元格')
        .action(async ({ session }, cell: string) => {
            if (!cell) {
                return
            }
            const gameInfo = await getGameInfo(ctx, session.guildId)
            if (!gameInfo.isStarted) {
                return
            }
            // 将 cell 字符串按照一个或多个英文逗号或中文逗号或空格分割成一个数组
            const cells = Array.from(new Set(cell.split(/,+|，+|\s+/)));

            const savedPage = pageMap.get(session.guildId);
            // 遍历数组中的每个坐标
            for (const cell of cells) {
                await clickCloseBorder1ById(savedPage, cell)
                await sleep(1000)
                if (!await checkGameOver(savedPage)) {
                    if (await checkGameWin(savedPage)) {
                        await updateRank(ctx, session.userId, session.username, 1)
                        await session.sendQueued(`${h.at(session.userId)} ~\n恭喜你喵~ 获得 1 点积分喵~\n\n${msg.success}\n${h.image(await screenshotPage(savedPage), 'image/png')}`)
                        return
                    }
                    await updateRank(ctx, session.userId, session.username, 1)
                    await session.sendQueued(`${h.at(session.userId)} ~\n恭喜你喵~ 获得 1 点积分喵~\n\n${msg.going}${h.image(await screenshotPage(savedPage), 'image/png')}`)
                } else {
                    await updateRank(ctx, session.userId, session.username, -1)
                    await session.sendQueued(`${h.at(session.userId)} ~\n你输了喵~ 扣除 1 点积分喵~\n\n${msg.fail}\n${h.image(await screenshotPage(savedPage), 'image/png')}`)
                    await ctx.model.set(GAME_ID, { guildId: session.guildId }, { isStarted: false })
                }
            }
            async function updateRank(ctx: Context, userId: string, userName: string, score: number) {
                const rankInfo = await ctx.model.get(RANK_ID, { userId: userId })
                if (rankInfo.length === 0) {
                    await ctx.model.create(RANK_ID, { userId: userId, userName: userName, score: score })
                } else {
                    await ctx.model.set(RANK_ID, { userId: userId }, { userName: userName, score: rankInfo[0].score + score })
                }
            }

            async function clickCloseBorder1ById(page: Page, id: string) {
                // 使用属性选择器，找到对应id的"close border1"元素
                const element = await page.$(`td.close.border1[id="${id}"]`);
                // 如果元素存在，模拟鼠标点击
                if (element) {
                    await element.click();
                }
            }

            // 定义一个异步函数，接受一个page参数
            async function checkGameOver(page: Page) {
                try {
                    // 定义一个变量，用来存储失败信息的元素
                    // 通过id选择器找到失败信息的元素
                    const loseText = await page.$('#losetext');

                    // 判断元素是否存在并且显示状态为inline-block
                    if (loseText && (await loseText.evaluate((node) => (node as any).style.display === 'inline-block'))) {
                        // 返回true表示游戏结束
                        return true;
                    } else {
                        // 返回false表示游戏继续
                        return false;
                    }
                } catch (error) {
                    // 捕获并打印错误信息
                    logger.error(error);
                    // 返回true表示游戏结束
                    return true;
                }
            }

            // 定义一个异步函数，接受一个page参数
            async function checkGameWin(page: Page) {
                try {
                    // 定义一个变量，用来存储成功信息的元素
                    // 通过id选择器找到成功信息的元素
                    const winText = await page.$('#wintext');

                    // 判断元素是否存在并且显示状态为inline-block
                    if (winText && (await winText.evaluate((node) => (node as any).style.display === 'inline-block'))) {
                        // 返回true表示游戏成功
                        return true;
                    } else {
                        // 返回false表示游戏继续
                        return false;
                    }
                } catch (error) {
                    // 捕获并打印错误信息
                    logger.error(error);
                    // 返回false表示游戏继续
                    return false;
                }
            }
        })
    // hint
    ctx.command('minesweeper.hint', '获取扫雷提示')
        .action(async ({ session }) => {
            const gameInfo = await getGameInfo(ctx, session.guildId)
            if (!gameInfo.isStarted) {
                return msg.isNotStarted
            }
            const savedPage = pageMap.get(session.guildId);
            // 查找 id 为 hint 的元素，并点击它
            await savedPage.click('#hint');
            await sleep(1 * 1000)
            await session.sendQueued(`${h.image(await screenshotPage(savedPage), 'image/png')}`)
        })
    // flag
    ctx.command('minesweeper.flag <cell:text>', '标记或取消标记可能有雷的地方')
        .action(async ({ session }, cell) => {
            const gameInfo = await getGameInfo(ctx, session.guildId)
            if (!gameInfo.isStarted) {
                return msg.isNotStarted
            }
            // 将 cell 字符串按照一个或多个英文逗号或中文逗号或空格分割成一个数组
            const cells = Array.from(new Set(cell.split(/,+|，+|\s+/)));
            const savedPage = pageMap.get(session.guildId);
            // 遍历数组中的每个坐标
            for (const cell of cells) {
                await rightClickCloseBorder1ById(savedPage, cell)
                await sleep(500)
            }
            await session.sendQueued(h.image(await screenshotPage(savedPage), 'image/png'))

            async function rightClickCloseBorder1ById(page: Page, id: string) {
                try {
                    // 使用属性选择器，找到对应id的"close border1"元素
                    const element = await page.$(`td.close.border1[id="${id}"]`);
                    // 如果元素存在，模拟鼠标右击
                    if (element) {
                        if (await isMarked(page, id)) {
                            // 使用page.evaluate方法，在页面上执行一些JavaScript代码
                            await element.click({ button: 'right' });
                            await sleep(1 * 1000)
                            // 获取元素的 div 子节点
                            const div = await element.$('div');
                            // 在 div 中添加 id 文本
                            await page.evaluate((div, id) => {
                                div.textContent = id;
                            }, div, id);
                        } else {
                            await element.click({ button: 'right' });
                        }

                    }
                } catch (error) {
                    logger.error(error)
                }
            }


        })
    // rank
    ctx.command('minesweeper.rank', '查看扫雷排行榜')
        .action(async ({ }) => {
            // 获取游戏信息
            const rankInfo: MinesweeperRank[] = await ctx.model.get(RANK_ID, {})
            // 根据score属性进行降序排序
            rankInfo.sort((a, b) => b.score - a.score)
            // 只保留前十名玩家，并生成排行榜的纯文本
            const table: string = generateRankTable(rankInfo.slice(0, 10))
            return table

            // 定义一个函数来生成排行榜的纯文本
            function generateRankTable(rankInfo: MinesweeperRank[]): string {
                // 定义排行榜的模板字符串
                const template = `
扫雷排行榜：
 排名  昵称   积分  
--------------------
${rankInfo.map((player, index) => ` ${String(index + 1).padStart(2, ' ')}   ${player.userName.padEnd(6, ' ')} ${player.score.toString().padEnd(4, ' ')}`).join('\n')}
`
                return template
            }
        })

    // 设置命令，接受一个难度系数作为参数
    // ctx.command('minesweeper.set <difficulty:number>', '设置').action(
    // async ({ session }, difficulty: number) => {
    // 获取游戏信息
    // const gameInfo = await getGameInfo(ctx, session.guildId);
    // if (!gameInfo.isStarted) {
    // return msg.isNotStarted;
    // }
    // 获取保存的页面对象
    // const savedPage = pageMap.get(session.guildId);
    // 获取滑块元素句柄
    // const slider = await savedPage.$('#fieldsize');
    // 获取滑块的位置和尺寸，并解构赋值给变量
    // const { x, y, width, height } = await slider.boundingBox();
    // 计算滑块的中心点坐标
    // const sliderCenterX = x + width / 2;
    // const sliderCenterY = y + height / 2;
    // 模拟鼠标移动到滑块中心点并按下左键
    // await savedPage.mouse.move(sliderCenterX, sliderCenterY);
    // await savedPage.mouse.down();
    // 计算滑块移动的距离，根据难度系数的范围和滑块的高度
    // const sliderMoveDistance = (difficulty / 100) * height;
    // 模拟鼠标垂直移动一定距离，调整难度大小
    // await savedPage.mouse.move(
    //     sliderCenterX,
    //     sliderCenterY + sliderMoveDistance,
    //     { steps: 10 }
    // );
    // 模拟鼠标松开左键
    // await savedPage.mouse.up();
    // 发送截图
    //         await session.sendQueued(
    //             `难度已设置为${difficulty}，请看截图` +
    //             h.image(await screenshotPage(savedPage), 'image/png')
    //         );
    //     }
    // );


    // 辅助函数

    async function getGameInfo(ctx: Context, guildId: string): Promise<MinesweeperGames> {
        const gameInfo = await ctx.model.get(GAME_ID, { guildId: guildId })
        if (gameInfo.length === 0) {
            return await ctx.model.create(GAME_ID, { guildId: guildId, isStarted: false })
        } else {
            return gameInfo[0]
        }
    }

    function randomBrowserVersion(): string {
        // 生成一个 2 字节的随机缓冲区
        const buffer = crypto.randomBytes(2);

        // 将缓冲区转换为无符号整数
        const number = buffer.readUInt16BE();

        // 使用第一个字节作为主要版本，第二个字节作为次要版本
        const major = number >> 8;
        const minor = number & 0xff;

        // 返回版本号字符串，格式为 major.minor.0.0
        return `${major}.${minor}.0.0`;
    }
    function randomUserAgent(): string {
        // 为基本用户代理字符串定义一个常量
        const base = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)';

        // 使用 randomBrowserVersion 函数生成随机的 Chrome 版本号
        const chrome = `Chrome/${randomBrowserVersion()}`;

        // 使用 randomBrowserVersion 函数生成随机的Edge版本号
        const edge = `Edg/${randomBrowserVersion()}`;

        // 返回用户代理字符串，格式为基本 chrome safari edge
        return `${base} ${chrome} Safari/537.36 ${edge}`;
    }

    // 核心功能实现
    const pageUrl = 'https://zwolfrost.github.io/JSMinesweeper/';

    // 定义一个异步函数，用于启动浏览器并打开网页
    async function openPage() {
        // 随机生成 userAgent 字符串
        const userAgent = randomUserAgent();
        // 创建一个新的页面，并返回一个 page 对象
        const context = await browser.createIncognitoBrowserContext();
        const page = await context.newPage();
        await page.setUserAgent(userAgent);
        // 设置页面视口大小
        await page.setViewport({
            width: 1920,
            height: 1080,
        });

        // 跳转到指定的网页，并等待网络空闲
        await page.goto(pageUrl, { waitUntil: 'networkidle0' });

        // 获取滑块元素句柄
        // const slider = await page.$('#fieldsize');
        // 获取滑块的位置和尺寸，并解构赋值给变量
        // const { x, y, width, height } = await slider.boundingBox();
        // 计算滑块的中心点坐标
        // const sliderCenterX = x + width / 2;
        // const sliderCenterY = y + height / 2;
        // 模拟鼠标移动到滑块中心点并按下左键
        // await page.mouse.move(sliderCenterX, sliderCenterY);
        // await page.mouse.down();
        // 计算滑块移动的距离，根据难度系数的范围和滑块的高度
        // const sliderMoveDistance = (90 / 100) * height;
        // console.log(height)
        // 模拟鼠标垂直移动一定距离，调整难度大小
        // await page.mouse.move(
        // sliderCenterX,
        // sliderCenterY + height * 0.1,
        // { steps: 10 }
        // );
        // 模拟鼠标松开左键
        // await page.mouse.up();

        // 返回 page 对象
        return page;
    }
    // 定义一个异步函数，接受一个id参数，返回一个布尔值表示是否被标记
    async function isMarked(page: Page, id: string): Promise<boolean> {
        // 获取想要检查的元素
        const element = await page.$(`td[id='${id}']`);
        // 获取该元素的innerHTML属性
        const innerHTML = await element.evaluate(el => el.innerHTML);
        // 判断该元素是否被标记
        if (innerHTML.includes('🚩')) {
            return true
        } else {
            return false
        }
    }
    // 定义一个异步函数，用于在页面上添加 id
    async function addIds(page: Page) {
        // 一次性获取所有的 close border1 元素，并对它们进行操作
        await page.$$eval('.close.border1', async (elements: any) => {
            // 遍历每个元素
            for (const element of elements) {
                // 获取元素的 id 属性
                const id = element.id;

                // 获取元素的 div 子节点
                const div = element.querySelector('div');

                // 在 div 中添加 id 文本，并设置字体大小和颜色
                div.textContent = id;
                div.style.fontSize = '12px';
                div.style.color = 'black';
            }
        });
    }

    // 定义一个异步函数，用于在页面上移除 id
    async function removeIds(page: Page) {
        // 获取 board 元素的句柄
        const board = await page.evaluateHandle(() => document.getElementById('board'));

        // 在页面上添加一个 click 事件监听器
        await page.evaluate((board: { addEventListener: (arg0: string, arg1: (event: any) => Promise<void>) => void }) => {
            // 添加 click 事件监听器
            board.addEventListener('click', async (event: { target: HTMLElement }) => {
                // 获取被点击的元素
                const target = event.target as HTMLElement;

                // 如果元素是 close border1 类型，则删除其 div 子节点上的文本内容和样式属性
                if (target.classList.contains('close') && target.classList.contains('border1')) {
                    const div = target.querySelector('div');
                    if (div) {
                        div.textContent = '';
                        div.removeAttribute('style');
                    }
                }
            });
        }, board);

        // 在页面加载完成后，创建一个 MutationObserver 对象
        await page.evaluate((board: Node) => {
            // 定义一个回调函数，它会在观察到变化时被调用
            const callback = (mutationsList: any, _observer: any) => {
                // 遍历每个变化记录
                for (const mutation of mutationsList) {
                    // 如果变化类型是属性变化
                    if (mutation.type === 'attributes') {
                        // 获取变化的元素
                        const element = mutation.target;

                        // 获取其 class 属性值
                        const elementClass = element.getAttribute('class');

                        // 如果其 class 属性值为 "open"
                        if (elementClass === 'open') {
                            // 获取其 div 子节点
                            const div = element.querySelector('div');

                            // 如果其 div 子节点的 style 属性值为 "font-size: 12px; color: black;"，则删除其 div 子节点上的文本内容
                            const divStyle = div?.getAttribute('style');
                            if (divStyle === 'font-size: 12px; color: black;') {
                                div.textContent = '';
                            }
                        }
                    }
                }
            };

            // 创建一个 MutationObserver 对象，并传入回调函数
            const observer = new MutationObserver(callback);

            // 定义一个配置对象，指定要观察的属性和子节点
            const config = { attributes: true, subtree: true };

            // 调用 observe 方法，开始观察 board 元素下的所有元素的 class 属性变化
            observer.observe(board, config);
        }, board)
    }

    // 定义一个异步函数，用于截图保存结果
    async function screenshotPage(page: Page) {
        // 获取目标元素的句柄，使用CSS选择器
        const element = await page.$('div#container.border1');
        let screenshot: Buffer;
        // 如果找到了目标元素，就对它进行截图，并返回一个 Buffer 对象
        if (element) {
            if (config.isEnableImageCompression) {
                // 截取带有 clip 选项的元素的屏幕截图
                screenshot = await element.screenshot({
                    type: "jpeg",
                    quality: config.PictureQuality,
                }) as Buffer;
            } else {
                // 截取带有 clip 选项的元素的屏幕截图
                screenshot = await element.screenshot({
                    type: "png",
                }) as Buffer;
            }
        }
        return screenshot;
    }

    // 用于保存 page 对象的 Map
    const pageMap = new Map();

    // 定义一个异步函数，用于调用上述函数，并返回截图结果
    async function showIds(guildId: string): Promise<any> {
        // 调用 openPage 函数，获取 browser 和 page 对象
        const page = await openPage();

        // 调用 addIds 函数，在页面上添加 id
        await addIds(page);

        // 调用 removeIds 函数，在页面上移除 id
        await removeIds(page);

        // 等待页面上的元素加载出来，指定选择器和超时时间
        // 这里使用了CSS选择器，匹配id为0或1的td元素下的div元素，并且div元素的style属性包含font-size和color
        await page.waitForSelector('td[id="0"] > div[style*="font-size"][style*="color"], td[id="1"] > div[style*="font-size"][style*="color"]', { timeout: 3000 });

        // 调用 screenshotPage 函数，截图保存结果
        const screenshot = await screenshotPage(page);
        // 监听 targetcreated 事件
        // browser.on('targetcreated', async (target) => {
        //     if (target.type() === 'page') {
        //         // 创建新页面
        //         const page = await target.page();
        //         // 将 page 对象保存到 Map 中
        //         pageMap.set(guildId, page);
        //     }
        // });
        pageMap.set(guildId, page);
        await ctx.model.set(GAME_ID, { guildId: guildId }, { isStarted: true })
        // 返回截图结果
        return screenshot;
    }

    // 定义一个无头浏览器实例
    let browser: Browser;

    // 启动浏览器实例
    async function launchBrowser() {
        browser = await puppeteer.launch({
            executablePath,
            headless: "new",
            // headless: false,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });
        // await openPage();
    }

    // 关闭浏览器实例
    async function closeBrowser() {
        await browser.close();
    }

    // 在程序开始时启动浏览器实例
    launchBrowser();


    ctx.on('dispose', async () => {
        // 在程序结束时关闭浏览器实例
        closeBrowser();
        await ctx.model.set(GAME_ID, {}, { isStarted: false })
    })
}



