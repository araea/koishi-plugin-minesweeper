# koishi-plugin-minesweeper

[![npm](https://img.shields.io/npm/v/koishi-plugin-minesweeper?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-minesweeper)

## 🎈 介绍

koishi-plugin-minesweeper 是一个基于 Koishi 框架的插件，实现了一个简单的扫雷游戏。

## 🚀 特性

- 开始、停止、重新开始扫雷游戏
- 翻开、标记或取消标记可能有雷的地方
- 获取扫雷提示
- 查看扫雷排行榜
- 设置扫雷难度（暂未实现）

## 🌠 后续计划

* 🤖 夜间模式、扫雷难度设置

## 📦 安装

```
前往 Koishi 插件市场添加该插件即可
```

## ⚙️ 配置

```
`isEnableImageCompression`: false, // 是否压缩图片，默认为 false
`PictureQuality`: 80, // 压缩后图片的质量，1-100，默认为 80
```

## 🎮 使用

- 请确保你能够打开这个网站 [JS Minesweeper (zwolfrost.github.io)](https://zwolfrost.github.io/JSMinesweeper/)

### 📝 命令

使用以下命令来玩扫雷游戏：

- `minesweeper`：显示扫雷帮助信息
- `minesweeper.start`：开始扫雷游戏，会显示一个扫雷网格，每个单元格有一个编号，如 `0,0` 表示第一行第一列的单元格
- `minesweeper.stop`：停止扫雷游戏，会清除当前的游戏状态和排行榜
- `minesweeper.restart`：重新开始扫雷游戏，会重置当前的游戏状态和排行榜，并显示一个新的扫雷网格
- `minesweeper.open <cell>`：翻开所选单元格，如 `minesweeper.open 0,0` 表示翻开第一行第一列的单元格。如果翻开的单元格有数字，表示周围有多少个雷；如果翻开的单元格是空白，表示周围没有雷；如果翻开的单元格是地雷，表示游戏失败。可以一次翻开多个单元格，用逗号(中英文均可)或空格分隔，如 `minesweeper.open 0,66,11`
- `minesweeper.flag <cell>`：标记或取消标记可能有雷的地方，如 `minesweeper.flag 0,0` 表示在第一行第一列的单元格上放一个旗子。如果该单元格已经被标记，则取消标记。可以一次标记或取消标记多个单元格，用逗号或空格分隔，如 `minesweeper.flag 0,0,1,1`
- `minesweeper.hint`：获取扫雷提示，会在一个未翻开且没有雷的单元格上显示一个问号
- `minesweeper.rank`：查看扫雷排行榜，会显示前十名玩家的昵称和积分。每翻开一个没有雷的单元格，积分加一；每翻开一个有雷的单元格，积分减一。
- `minesweeper.set <difficulty>`：设置扫雷难度（暂未实现），难度系数为 1-100 的整数，数值越大难度越高。

## 🙏 致谢

* [Koishi](https://koishi.chat/)：机器人框架
* [JSMinesweeper](https://github.com/zWolfrost/JSMinesweeper)：功能实现核心

## 📄 License

MIT License © 2023

本插件遵循 MIT 协议。

希望你喜欢这个插件，并享受扫雷游戏的乐趣。😄