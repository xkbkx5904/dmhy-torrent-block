// ==UserScript==
// @name         DMHY Torrent Block
// @name:zh-CN   动漫花园种子屏蔽助手
// @namespace    https://github.com/xkbkx5904
// @version      1.0.1
// @author       xkbkx5904
// @description  Enhanced version of DMHY Block script with more features: UI management, regex filtering, context menu, and ad blocking
// @description:zh-CN  增强版的动漫花园资源屏蔽工具，支持用户界面管理、正则表达式过滤、右键菜单和广告屏蔽等功能
// @homepage     https://github.com/xkbkx5904/dmhy-torrent-block
// @supportURL   https://github.com/xkbkx5904/dmhy-torrent-block/issues
// @match        *://share.dmhy.org/*
// @license      MIT
// @run-at       document-end
// @grant        GM_setValue
// @grant        GM_getValue
// @noframes
// @copyright    2025, xkbkx5904
// @originalAuthor tautcony
// @originalURL  https://greasyfork.org/zh-CN/scripts/36871-dmhy-block
// @icon         https://share.dmhy.org/favicon.ico
// ==/UserScript==

// 用户黑名单列表，存储被屏蔽的用户信息和关键词
let UserBlockList = [];

// 从本地存储加载黑名单
function loadBlockList() {
    try {
        const saved = GM_getValue('dmhy_blocklist', []);
        UserBlockList = Array.isArray(saved) ? saved.map(item => {
            if (item.type === 'keywords') {
                return {
                    type: 'keywords',
                    values: item.values.map(k => {
                        if (typeof k === 'string' && k.startsWith('/') && k.endsWith('/')) {
                            try {
                                return new RegExp(k.slice(1, -1));
                            } catch (e) {
                                return k;
                            }
                        }
                        return k;
                    })
                };
            }
            return item;
        }) : [];
    } catch (err) {
        UserBlockList = [];
    }
}

// 保存黑名单到本地存储
function saveBlockList() {
    try {
        const listToSave = UserBlockList.map(item => {
            if (item.type === 'keywords') {
                return {
                    type: 'keywords',
                    values: item.values.map(k => {
                        if (k instanceof RegExp) {
                            return `/${k.source}/`;
                        }
                        return k;
                    })
                };
            }
            return item;
        });
        GM_setValue('dmhy_blocklist', listToSave);
    } catch (err) {
        // 静默处理错误
    }
}

// 根据黑名单过滤资源列表
function RemoveTorrentInBlockList() {
    try {
        // 先恢复所有被隐藏的条目
        const hiddenItems = document.querySelectorAll("table#topic_list tbody tr[style*='display: none']");
        hiddenItems.forEach(elem => {
            elem.style.display = '';
        });

        // 如果黑名单为空，直接返回
        if (!UserBlockList.length) return;

        // 获取黑名单用户ID和关键词
        const blockedUserIds = UserBlockList.find(item => item.type === 'userId')?.values || [];
        const blockedKeywords = UserBlockList.find(item => item.type === 'keywords')?.values || [];

        // 如果没有任何屏蔽规则，直接返回
        if (!blockedUserIds.length && !blockedKeywords.length) return;

        const tableList = document.querySelectorAll("table#topic_list tbody tr");
        tableList.forEach(elem => {
            try {
                const titleCell = elem.querySelector("td.title");
                const title = titleCell ? Array.from(titleCell.childNodes)
                    .map(node => node.textContent?.trim())
                    .filter(text => text)
                    .join(' ') : '';

                const idMatch = elem.querySelector("td:last-child a[href*='/user_id/']")?.href?.match(/user_id\/(\d+)/);

                if (!title || !idMatch) return;

                const id = parseInt(idMatch[1]);
                let remove = false;

                // 检查用户ID是否在黑名单中
                if (blockedUserIds.includes(id)) {
                    remove = true;
                }

                // 检查标题是否包含黑名单关键词
                if (!remove && blockedKeywords.length > 0) {
                    for (const keyword of blockedKeywords) {
                        if (typeof keyword === 'string') {
                            if (title.toLowerCase().includes(keyword.toLowerCase())) {
                                remove = true;
                                break;
                            }
                        } else if (keyword instanceof RegExp) {
                            if (title.match(keyword)) {
                                remove = true;
                                break;
                            }
                        }
                    }
                }

                // 隐藏匹配的资源条目
                if (remove) {
                    elem.style.display = 'none';
                }
            } catch (err) {
                // 静默处理单条资源的处理错误
            }
        });
    } catch (err) {
        // 静默处理整体过滤错误
    }
}

// UI相关函数
function addBlocklistUI() {
    const uiHtml = `
        <div id="dmhy-blocklist-ui" style="position:fixed;left:10px;top:10px;z-index:9999;">
            <button id="show-blocklist">管理种子黑名单</button>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', uiHtml);

    document.getElementById('show-blocklist')?.addEventListener('click', showBlocklistManager);
}

function showBlocklistManager() {
    const managerHtml = `
        <div id="blocklist-manager" style="position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);
            background:white;padding:20px;border:1px solid #ccc;border-radius:5px;z-index:10000;
            width:500px;max-height:80vh;overflow-y:auto;">
            <h3 style="margin-top:0;">管理种子黑名单</h3>
            <div style="margin-bottom:10px;">
                <label>用户ID（用分号分隔）：</label><br>
                <textarea id="user-ids" style="width:100%;height:100px;margin-top:5px;resize:none;"></textarea>
            </div>
            <div style="margin-bottom:10px;">
                <label>标题关键词（用分号分隔）：</label><br>
                <textarea id="keywords" style="width:100%;height:100px;margin-top:5px;resize:none;"></textarea>
            </div>
            <div style="display:flex;justify-content:space-between;color:#666;font-size:12px;margin-top:5px;">
                <div style="flex:1;margin-right:10px;">
                    提示：支持普通关键词和正则表达式<br>
                    - 普通关键词直接输入，用分号分隔<br>
                    - 正则表达式用 / 包裹，例如：/\\d+话/<br>
                    - 示例：关键词1；/\\d+话/；关键词2
                </div>
                <div style="flex:1;margin-left:10px;">
                    提示：用户ID获取方式：<br>
                    - 在用户名上右键点击，选择"添加用户到黑名单"<br>
                    - 或点击用户名，从URL中获取数字ID
                </div>
            </div>
            <div style="margin-top:10px;text-align:right;">
                <button id="save-blocklist">保存</button>
                <button id="close-manager">关闭</button>
            </div>
        </div>
        <div id="blocklist-overlay" style="position:fixed;top:0;left:0;right:0;bottom:0;
            background:rgba(0,0,0,0.5);z-index:9999;"></div>
    `;

    document.body.insertAdjacentHTML('beforeend', managerHtml);

    // 填充现有数据
    const userIds = UserBlockList.find(item => item.type === 'userId')?.values || [];
    const keywords = UserBlockList.find(item => item.type === 'keywords')?.values || [];

    document.getElementById('user-ids').value = userIds.join('；');
    document.getElementById('keywords').value = keywords.map(k => {
        if (k instanceof RegExp) {
            return `/${k.source}/`;
        }
        return k;
    }).join('；');

    // 保存更新
    document.getElementById('save-blocklist')?.addEventListener('click', () => {
        const newUserIds = document.getElementById('user-ids').value
            .split(/[;；]/)
            .map(id => id.trim())
            .filter(id => id && !isNaN(id))
            .map(id => parseInt(id));

        const newKeywords = document.getElementById('keywords').value
            .split(/[;；]/)
            .map(k => k.trim())
            .filter(k => k)
            .map(k => {
                if (k.startsWith('/') && k.endsWith('/')) {
                    try {
                        return new RegExp(k.slice(1, -1));
                    } catch (e) {
                        return k;
                    }
                }
                return k;
            });

        UserBlockList = [
            { type: 'userId', values: newUserIds },
            { type: 'keywords', values: newKeywords }
        ];

        saveBlockList();
        closeManager();
        RemoveTorrentInBlockList();
    });

    // 关闭管理界面
    function closeManager() {
        document.getElementById('blocklist-manager')?.remove();
        document.getElementById('blocklist-overlay')?.remove();
    }

    document.getElementById('close-manager')?.addEventListener('click', closeManager);
    document.getElementById('blocklist-overlay')?.addEventListener('click', e => {
        if (e.target === e.currentTarget) closeManager();
    });
}

// 添加右键菜单功能
function addContextMenu() {
    // 创建右键菜单元素
    const menuHtml = `
        <div id="dmhy-context-menu" style="display:none;position:fixed;background:white;
            border:1px solid #ccc;border-radius:3px;padding:5px;box-shadow:2px 2px 5px rgba(0,0,0,0.2);z-index:10000;">
            <div id="block-user" style="padding:5px 10px;cursor:pointer;hover:background-color:#f0f0f0;">
                添加用户到黑名单
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', menuHtml);

    const menu = document.getElementById('dmhy-context-menu');

    // 为所有用户ID链接添加右键事件
    document.addEventListener('contextmenu', function(e) {
        const userLink = e.target.closest('a[href*="/user_id/"]');
        if (userLink) {
            e.preventDefault();
            const userId = userLink.href.match(/user_id\/(\d+)/)?.[1];
            if (userId) {
                const scrollX = window.scrollX;
                const scrollY = window.scrollY;
                
                menu.style.display = 'block';
                menu.style.left = (e.clientX + scrollX) + 'px';
                menu.style.top = (e.clientY + scrollY) + 'px';
                
                // 点击添加到黑名单
                const blockUserOption = document.getElementById('block-user');
                blockUserOption.onclick = function() {
                    addUserToBlocklist(parseInt(userId));
                    menu.style.display = 'none';
                };
            }
        }
    });

    // 点击其他地方关闭菜单
    document.addEventListener('click', function() {
        menu.style.display = 'none';
    });
}

// 添加用户到黑名单
function addUserToBlocklist(userId) {
    if (!userId || isNaN(userId)) return;
    
    const userIdList = UserBlockList.find(item => item.type === 'userId')?.values || [];
    if (!userIdList.includes(userId)) {
        // 如果没有userId类型的项，添加一个
        const userIdItem = UserBlockList.find(item => item.type === 'userId');
        if (userIdItem) {
            userIdItem.values.push(userId);
        } else {
            UserBlockList.push({ type: 'userId', values: [userId] });
        }
        
        saveBlockList();
        RemoveTorrentInBlockList();
        
        // 显示提示
        alert('已将用户ID: ' + userId + ' 添加到黑名单');
    } else {
        alert('该用户已在黑名单中');
    }
}

// 初始化
(function() {
    'use strict';

    // 广告处理：等待页面加载完成后执行
    window.addEventListener('load', () => {
        // 广告选择器：匹配各种可能的广告元素
        const adSelectors = [
            '#pkpk',                                              // 顶部广告
            '[id="1280_adv"]',                                   // 1280广告位
            'div[align="center"] img[width="1280"][height="120"]', // 通过尺寸匹配
            'a[onclick*="_trackEvent"][onclick*="ad"]',           // 通过点击事件匹配
            '.kiwi-ad-wrapper-1280x120'                          // 通过类名匹配
        ];

        // 延迟100ms后隐藏广告，确保广告统计正常
        setTimeout(() => {
            adSelectors.forEach(selector => {
                const elements = document.querySelectorAll(selector);
                elements.forEach(element => {
                    if (element) {
                        element.style.display = 'none';
                    }
                });
            });
        }, 100);
    });

    // 初始化功能
    loadBlockList();           // 加载黑名单
    addBlocklistUI();         // 添加管理界面
    addContextMenu();         // 添加右键菜单功能

    // 执行初次过滤
    RemoveTorrentInBlockList();

    // 监听排序操作，重新过滤资源
    document.querySelectorAll("th.header").forEach(header => {
        header.addEventListener('click', () => {
            setTimeout(RemoveTorrentInBlockList, 100);
        });
    });

    // 隐藏 PikPak 按钮
    function hidePikPakButtons() {
        const pikpakButtons = document.querySelectorAll('a[href*="mypikpak.com/drive/url-checker"]');
        pikpakButtons.forEach(button => {
            button.style.display = 'none';
        });
    }

    // 初始执行
    hidePikPakButtons();

    // 监听 DOM 变化，处理动态加载的内容
    const observer = new MutationObserver(hidePikPakButtons);
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
})();
