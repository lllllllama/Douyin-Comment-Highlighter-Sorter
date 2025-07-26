// ==UserScript==
// @name        抖音评论实时排序高亮 (v2.9.1 UI优化版)
// @namespace   https://github.com/lllllllama/Douyin-Comment-Highlighter-Sorter
// @version     2.9.1
// @description 【UI优化版】在保持原有代码结构不变的前提下，对UI界面进行现代化美化，提升视觉体验。
// @author      Lama
// @match       *://www.douyin.com/*
// @match       *://live.douyin.com/*
// @grant       none
// @license     MIT
// ==/UserScript==

(function() {
    'use strict';

    // ========================================================================
    // --- 配置区域 ---
    // ========================================================================
    const SELECTORS = {
        commentContainer: 'div[data-e2e="comment-list"]',
        commentItem: 'div[data-e2e="comment-item"]',
        commentText: '[data-e2e="comment-item-content-container"], [class*="CommentContent"], .C7LroK_h',
    };
    const CHUNK_SIZE = 200;

    // ========================================================================
    // --- 全局状态变量 ---
    // ========================================================================
    let isProcessing = false;
    let originalCommentNodes = [];
    let uiInitialized = false;

    // ========================================================================
    // --- UI界面与日志 ---
    // ========================================================================
    function setupUI() {
        if (document.getElementById('gemini-reorder-panel')) return;
        uiInitialized = true;
        const panel = document.createElement('div');
        panel.id = 'gemini-reorder-panel';
        panel.innerHTML = `
            <h3 id="g-panel-header">评论智能排序 v2.9</h3>
            <div class="input-group"><label>关键词:</label><input id="g-keywords-input" type="text" placeholder="多个词用空格隔开"></div>
            <div class="input-group"><label>加载上限:</label><input id="g-limit-input" type="number" value="1000" min="1"></div>
            <div class="input-group"><label>加载延时(ms):</label><input id="g-delay-input" type="number" value="500" min="100"></div>
            <div class="button-group"><button id="g-reorder-btn">排序高亮</button><button id="g-reset-btn">重置</button></div>
            <div id="g-status-label">等待操作...</div>
            <textarea id="g-log-output" readonly></textarea>
        `;
        document.body.appendChild(panel);
        const style = document.createElement('style');
        style.innerHTML = `
            #gemini-reorder-panel {
                position: fixed;
                width: 320px;
                background: #fdfdfd;
                border: 1px solid #e9e9e9;
                border-radius: 10px;
                padding: 18px;
                z-index: 10000;
                box-shadow: 0 6px 18px rgba(0,0,0,0.08);
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                display: flex;
                flex-direction: column;
                gap: 15px;
            }
            #gemini-reorder-panel h3 {
                margin: 0;
                font-size: 16px;
                text-align: center;
                cursor: move;
                user-select: none;
                color: #222;
                font-weight: 600;
            }
            #gemini-reorder-panel .input-group {
                display: flex;
                align-items: center;
            }
            #gemini-reorder-panel label {
                width: 95px; /* 调整标签宽度 */
                font-size: 14px;
                flex-shrink: 0;
                color: #444;
            }
            #gemini-reorder-panel input[type="text"],
            #gemini-reorder-panel input[type="number"] {
                width: 100%;
                box-sizing: border-box;
                padding: 9px 12px;
                border: 1px solid #ddd;
                border-radius: 6px;
                background: #f1f1f2;
                transition: box-shadow 0.2s, border-color 0.2s;
            }
            #gemini-reorder-panel input:focus {
                outline: none;
                border-color: #007aff;
                box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.15);
            }
            #gemini-reorder-panel .button-group {
                display: grid; /* 使用grid布局更现代 */
                grid-template-columns: 1fr 1fr;
                gap: 12px;
            }
            #gemini-reorder-panel button {
                padding: 10px;
                border: none;
                border-radius: 6px;
                color: white;
                cursor: pointer;
                font-weight: 500;
                transition: background-color 0.2s, transform 0.1s ease;
            }
            #gemini-reorder-panel button:active {
                transform: scale(0.97);
            }
            #g-reorder-btn { background-color: #fe2c55; }
            #g-reorder-btn:hover { background-color: #e42045; }
            #g-reset-btn { background-color: #6c757d; }
            #g-reset-btn:hover { background-color: #5a6268; }
            #g-status-label {
                text-align: center;
                font-size: 13px;
                color: #555;
                font-weight: 500;
                background: #f1f1f2;
                padding: 8px;
                border-radius: 6px;
            }
            #g-log-output {
                width: 100%;
                height: 140px;
                box-sizing: border-box;
                background-color: #f1f1f2;
                border: 1px solid #ddd;
                border-radius: 6px;
                font-size: 12px;
                color: #555;
                font-family: 'SF Mono', 'Fira Code', 'Consolas', 'Menlo', monospace;
                resize: vertical;
                padding: 10px;
            }
            .gemini-highlighted-comment { background-color: #fffbeA !important; border: 1px solid #ffdf7e !important; border-radius: 8px; }
            .gemini-highlight-badge { font-weight: bold; color: #fe2c55; margin-right: 5px; }
        `;
        document.head.appendChild(style);
        document.getElementById('g-reorder-btn').onclick = startTask;
        document.getElementById('g-reset-btn').onclick = resetComments;
        makeDraggable(panel, document.getElementById('g-panel-header'));
    }

    function logToPanel(message) { const logOutput = document.getElementById('g-log-output'); if (logOutput) { const timestamp = new Date().toLocaleTimeString(); logOutput.value += `[${timestamp}] ${message}\n`; logOutput.scrollTop = logOutput.scrollHeight; } }
    function makeDraggable(panel, handle) { let isDragging = false; let offsetX, offsetY; const lastX = localStorage.getItem('gemini_panel_x'); const lastY = localStorage.getItem('gemini_panel_y'); if (lastX && lastY) { panel.style.left = lastX; panel.style.top = lastY; } else { panel.style.top = '20px'; panel.style.right = '20px'; } handle.addEventListener('mousedown', (e) => { isDragging = true; offsetX = e.clientX - panel.getBoundingClientRect().left; offsetY = e.clientY - panel.getBoundingClientRect().top; panel.style.right = 'auto'; panel.style.bottom = 'auto'; document.addEventListener('mousemove', onMouseMove); document.addEventListener('mouseup', onMouseUp); e.preventDefault(); }); function onMouseMove(e) { if (!isDragging) return; panel.style.left = `${e.clientX - offsetX}px`; panel.style.top = `${e.clientY - offsetY}px`; } function onMouseUp() { isDragging = false; localStorage.setItem('gemini_panel_x', panel.style.left); localStorage.setItem('gemini_panel_y', panel.style.top); document.removeEventListener('mousemove', onMouseMove); document.removeEventListener('mouseup', onMouseUp); } }

    // ========================================================================
    // --- 核心功能 (已重构) ---
    // ========================================================================

    async function startTask() {
        if (isProcessing) { logToPanel("[警告] 上一个任务仍在处理中..."); return; }
        isProcessing = true;
        const reorderBtn = document.getElementById('g-reorder-btn');
        const resetBtn = document.getElementById('g-reset-btn');
        reorderBtn.disabled = true;
        resetBtn.disabled = true;

        const commentContainer = document.querySelector(SELECTORS.commentContainer);
        if (!commentContainer) {
            logToPanel(`[错误] 找不到评论容器!`);
            isProcessing = false; reorderBtn.disabled = false; resetBtn.disabled = false;
            return;
        }

        await loadComments(commentContainer);
        backupComments(commentContainer);
        await reorderComments(commentContainer);

        logToPanel("已滚动到评论区顶部。");
        commentContainer.scrollTop = 0;

        isProcessing = false;
        reorderBtn.disabled = false;
        resetBtn.disabled = false;
    }

    async function loadComments(container) {
        const limit = parseInt(document.getElementById('g-limit-input').value, 10) || 1000;
        const delay = parseInt(document.getElementById('g-delay-input').value, 10) || 500;

        logToPanel(`开始自动加载评论，目标: ${limit}条，延时: ${delay}ms`);
        let currentCount = 0;
        let lastCount = -1;
        let noChangeCounter = 0;
        while(true) {
            currentCount = container.querySelectorAll(SELECTORS.commentItem).length;
            logToPanel(`当前已加载 ${currentCount} / ${limit} 条评论...`);
            if (currentCount >= limit || noChangeCounter >= 10) {
                if (currentCount >= limit) logToPanel("已达到加载上限。");
                else logToPanel("评论数量不再增加，可能已全部加载。");
                break;
            }
            if (currentCount === lastCount) {
                noChangeCounter++;
            } else {
                noChangeCounter = 0;
            }
            lastCount = currentCount;
            container.scrollTop = container.scrollHeight;
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    function backupComments(container) {
        logToPanel("正在备份评论原始顺序...");
        originalCommentNodes = [];
        const commentItems = container.querySelectorAll(SELECTORS.commentItem);
        commentItems.forEach(node => originalCommentNodes.push(node.cloneNode(true)));
        logToPanel(`备份完成，共 ${originalCommentNodes.length} 条评论。`);
    }

    function cleanupHighlights() {
        logToPanel("正在清理旧的高亮标记...");
        document.querySelectorAll('.gemini-highlighted-comment').forEach(el => el.classList.remove('gemini-highlighted-comment'));
        document.querySelectorAll('.gemini-highlight-badge').forEach(el => el.remove());
    }

    async function reorderComments(commentContainer) {
        const keywords = document.getElementById('g-keywords-input').value.toLowerCase().split(' ').filter(k => k);
        if (keywords.length === 0) { document.getElementById('g-status-label').innerText = "请输入关键词"; return; }

        cleanupHighlights();
        logToPanel(`开始排序, 关键词: "${keywords.join(',')}"`);

        const allCommentItems = commentContainer.querySelectorAll(SELECTORS.commentItem);
        let currentIndex = allCommentItems.length - 1;

        return new Promise(resolve => {
            function processChunk() {
                logToPanel(`正在处理 ${Math.max(0, currentIndex - CHUNK_SIZE + 1)} - ${currentIndex + 1} 条...`);
                const batchEnd = Math.max(-1, currentIndex - CHUNK_SIZE);
                for (let i = currentIndex; i > batchEnd; i--) {
                    processSingleComment(allCommentItems[i], keywords, commentContainer);
                }
                currentIndex = batchEnd;
                if (currentIndex > -1) {
                    setTimeout(processChunk, 0);
                } else {
                    logToPanel("全部处理完成！");
                    updateMatchCount(commentContainer);
                    resolve();
                }
            }
            processChunk();
        });
    }

    function processSingleComment(item, keywords, container) {
        const text = item.innerText.toLowerCase();
        const matches = keywords.some(k => text.includes(k));

        if (matches) {
            item.classList.add('gemini-highlighted-comment');

            const textEl = item.querySelector(SELECTORS.commentText);
            if (textEl && !item.querySelector('.gemini-highlight-badge')) {
                const badge = document.createElement('span');
                badge.className = 'gemini-highlight-badge';
                badge.innerText = '⭐';
                textEl.prepend(badge);
            }
            container.prepend(item);
        }
    }

    function updateMatchCount(container) { const statusLabel = document.getElementById('g-status-label'); const count = container.querySelectorAll('.gemini-highlighted-comment').length; statusLabel.innerText = `找到 ${count} 条相关评论`; }

    function resetComments() {
        if (isProcessing) { logToPanel("[警告] 请等待当前任务处理完成。"); return; }
        const commentContainer = document.querySelector(SELECTORS.commentContainer);
        if (!commentContainer) return;

        if (originalCommentNodes.length === 0) {
            logToPanel("没有可恢复的原始评论顺序。");
            return;
        }

        logToPanel("正在恢复评论原始顺序...");
        commentContainer.innerHTML = '';
        originalCommentNodes.forEach(node => commentContainer.appendChild(node.cloneNode(true)));

        commentContainer.scrollTop = 0;

        document.getElementById('g-status-label').innerText = `已恢复 ${originalCommentNodes.length} 条评论`;
        logToPanel("恢复完成，并已滚动到顶部。");
    }

    // ========================================================================
    // --- 脚本入口 ---
    // ========================================================================
    function initialize() {
        if (uiInitialized) return;
        const container = document.querySelector(SELECTORS.commentContainer);
        if (container && container.querySelector(SELECTORS.commentItem)) {
            uiInitialized = true;
            setupUI();
            logToPanel("脚本初始化成功！");
        }
    }

    const pageObserver = new MutationObserver(() => {
        if (!uiInitialized) {
            const commentContainer = document.querySelector(SELECTORS.commentContainer);
            if (commentContainer && commentContainer.querySelector(SELECTORS.commentItem)) {
                initialize();
            }
        }
    });

    pageObserver.observe(document.body, { childList: true, subtree: true });

})();