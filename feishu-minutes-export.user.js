// ==UserScript==
// @name         飞书妙记文字记录导出
// @name:en      Feishu Minutes Transcript Export
// @namespace    https://github.com/Icy-Cat/feishu-minutes-export
// @version      0.2.0
// @description  一键导出飞书妙记 / Lark Minutes 为 Markdown，默认在文字记录前包含会议纪要、待办和章节纪要。
// @description:en Export Feishu / Lark Minutes to Markdown with summary, todos, chapters and transcript.
// @author       Icy-Cat
// @homepageURL  https://github.com/Icy-Cat/feishu-minutes-export
// @supportURL   https://github.com/Icy-Cat/feishu-minutes-export/issues
// @downloadURL  https://raw.githubusercontent.com/Icy-Cat/feishu-minutes-export/main/feishu-minutes-export.user.js
// @updateURL    https://raw.githubusercontent.com/Icy-Cat/feishu-minutes-export/main/feishu-minutes-export.user.js
// @match        https://*.feishu.cn/minutes/*
// @match        https://*.larksuite.com/minutes/*
// @run-at       document-start
// @grant        none
// @license      MIT
// ==/UserScript==

(function () {
  'use strict';

  const getToken = () => location.pathname.match(/\/minutes\/([^/?#]+)/)?.[1] || null;
  const clean = (text) => String(text ?? '').replace(/[\u200b\ufeff]/g, '').trim();

  const fmtTime = (ms) => {
    const s = Math.floor(Number(ms) / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return h > 0 ? `${pad(h)}:${pad(m)}:${pad(ss)}` : `${pad(m)}:${pad(ss)}`;
  };

  // 每次导出取完整字幕，避免把滚动时加载的一小段误当整场记录。
  async function fetchAll(token) {
    if (!token) throw new Error('未识别 object_token');
    const base = `${location.origin}/minutes/api`;
    const lang = encodeURIComponent(window.bootData?.language || 'zh_cn');
    const query = `object_token=${encodeURIComponent(token)}&language=${lang}`;
    const read = async (path) => {
      const resp = await fetch(`${base}/${path}`, { credentials: 'same-origin' });
      if (!resp.ok) throw new Error(`读取妙记失败（HTTP ${resp.status}）`);
      const json = await resp.json();
      if (json?.code !== 0) throw new Error(`读取妙记失败：${json?.msg || json?.code || '未知错误'}`);
      return json.data;
    };
    const ids = await read(`subtitles/paragraph-ids?page_size=10000&page_num=0&${query}`);
    if (!ids?.list?.length) throw new Error('paragraph-ids 为空');
    const total = ids.total || ids.list.length;
    const subtitles = await read(`subtitles_v2?paragraph_id=${encodeURIComponent(ids.list[0].pid)}&size=${total}&translate_lang=default&is_fluent=false&filter_speaker=true&${query}`);
    if (!subtitles?.paragraphs?.length) throw new Error('字幕数据为空');
    if (subtitles.has_more || subtitles.paragraphs.length < total) {
      throw new Error('字幕未完整加载，请刷新页面后重试');
    }
    const speakers = await read(`speakers?size=10000&translate_lang=default&${query}`);
    return { subtitles, speakers };
  }

  function orderedItems(group) {
    const map = group?.summaries || {};
    const ids = (group?.sectionList || []).flatMap(section => section.contentIds || []);
    return (ids.length ? [...new Set(ids)].map(id => map[id]) : Object.values(map))
      .filter(item => item && clean(item.data));
  }

  // 读取编辑器正文，不读含“展开”等按钮的外层容器；折叠正文仍是完整文本。
  function editorMarkdown(element) {
    if (!element) return '';
    const rows = [...element.querySelectorAll('.ace-line')];
    if (!rows.length) return clean(element.textContent);
    return rows.map(row => {
      const list = row.querySelector('ul, ol');
      const depth = Number(list?.className.match(/list-(?:bullet|number)(\d+)/)?.[1] || 1);
      const prefix = list ? `${'    '.repeat(Math.max(0, depth - 1))}${list.tagName === 'OL' ? '1.' : '-'} ` : '';
      const text = clean(row.textContent);
      return text ? prefix + text : '';
    }).join('\n').trim();
  }

  function buildHeader() {
    const boot = window.bootData?.baseInfo?.objectToken === getToken() ? window.bootData : null;
    const summaryItems = orderedItems(boot?.summary);
    const summaries = summaryItems.filter(item => item.contentType === 0);
    const todos = summaryItems.filter(item => item.contentType === 1);
    const chapters = orderedItems(boot?.chapterSummary);
    const lines = [];
    const section = (title, content) => {
      if (content.length) lines.push(`## ${title}`, '', ...content, '');
    };

    const summaryNodes = [...document.querySelectorAll('.ai-summary-content-editable')];
    // 原始纪要已是 Markdown；未编辑时保留其加粗和列表层级。
    const summaryText = summaryNodes.length >= summaries.length && summaryNodes.length ? summaryNodes.map((node, index) => {
      const original = clean(summaries[index]?.data);
      const rendered = editorMarkdown(node);
      const plainOriginal = original.replace(/\*\*/g, '').replace(/^\s*[-*+]\s+/gm, '').replace(/\s+/g, '');
      const plainRendered = rendered.replace(/^\s*[-*+]\s+/gm, '').replace(/\s+/g, '');
      return original && plainOriginal === plainRendered ? original : rendered;
    }).filter(Boolean) : summaries.map(item => clean(item.data));
    section('会议纪要', summaryText);

    const todoNodes = [...document.querySelectorAll('.ai-summary-todo-editable-container')];
    const todoLines = todoNodes.length >= todos.length && todoNodes.length ? todoNodes.map(node => {
      const text = editorMarkdown(node.querySelector('.ai-summary-todo-content'));
      if (!text) return '';
      const checkbox = node.querySelector('input[type="checkbox"], [role="checkbox"]');
      const checked = checkbox?.checked || checkbox?.getAttribute('aria-checked') === 'true';
      const time = clean(node.querySelector('.summary-time')?.textContent);
      return `- [${checked ? 'x' : ' '}] ${time ? `[${time}] ` : ''}${text.replace(/\n/g, '\n  ')}`;
    }).filter(Boolean) : todos.map(item => `- [${item.checked ? 'x' : ' '}] ${item.startTime != null ? `[${fmtTime(item.startTime)}] ` : ''}${clean(item.data).replace(/\n/g, '\n  ')}`);
    section('待办', todoLines);

    const chapterNodes = [...document.querySelectorAll('.chapter-summary-timeline-item')];
    const chapterLines = chapterNodes.length >= chapters.length && chapterNodes.length ? chapterNodes.flatMap(node => {
      const title = editorMarkdown(node.querySelector('.chapter-title-editable-wrapper'));
      const text = editorMarkdown(node.querySelector('.chapter-content-editable-wrapper .minutes-editable'));
      const time = clean(node.querySelector('.chapter-summary-timeline-item-time')?.textContent);
      return title || text ? [`### ${time ? `[${time}] ` : ''}${title || '章节'}`, '', text, ''] : [];
    }) : chapters.flatMap(item => [`### [${fmtTime(item.startTime || 0)}] ${clean(item.title) || '章节'}`, '', clean(item.data), '']);
    section('章节纪要', chapterLines);
    return lines;
  }

  function buildMarkdown({ subtitles, speakers }) {
    const pidToUid = speakers?.paragraph_to_speaker || {};
    const userMap = speakers?.speaker_info_map || {};
    const title = (document.title || '飞书妙记').replace(/\s*-\s*飞书.*$/, '').trim() || 'minutes';
    const lines = [`# ${title}`, '', ...buildHeader(), '## 文字记录', ''];
    let lastSpeaker = null;
    for (const p of subtitles.paragraphs || []) {
      if (!p.sentences?.length) continue;
      const uid = pidToUid[p.sentences[0].sid];
      const speaker = (uid && userMap[uid]?.user_name) || '未知发言人';
      const startMs = p.sentences[0].start_time ?? p.start_time ?? 0;
      const text = p.sentences.map(s => (s.contents || []).map(c => c.content).join('')).join('').trim();
      if (!text) continue;
      if (speaker !== lastSpeaker) {
        if (lastSpeaker !== null) lines.push('');
        lines.push(`### ${speaker}`);
        lastSpeaker = speaker;
      }
      lines.push(`- [${fmtTime(startMs)}] ${text}`);
    }
    return lines.join('\n');
  }

  async function exportMarkdown() {
    const token = getToken();
    const data = await fetchAll(token);
    if (getToken() !== token) throw new Error('妙记页面已切换，请重新导出');
    return buildMarkdown(data);
  }

  async function copyMd() {
    const md = await exportMarkdown();
    await navigator.clipboard.writeText(md);
    toast(`已复制 ${md.length} 字`);
  }

  async function downloadMd() {
    const md = await exportMarkdown();
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safe = (document.title || 'minutes').replace(/[\\/:*?"<>|]/g, '_').slice(0, 80);
    a.href = url;
    a.download = `${safe}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast('已开始下载');
  }

  function toast(msg) {
    const el = document.createElement('div');
    el.textContent = msg;
    Object.assign(el.style, {
      position: 'fixed', right: '24px', bottom: '80px', zIndex: 999999,
      background: 'rgba(0,0,0,.8)', color: '#fff', padding: '8px 14px',
      borderRadius: '6px', fontSize: '13px', fontFamily: 'sans-serif',
    });
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1800);
  }

  function injectUI() {
    if (document.getElementById('mm-export-panel')) return;
    const wrap = document.createElement('div');
    wrap.id = 'mm-export-panel';
    Object.assign(wrap.style, {
      position: 'fixed', right: '20px', bottom: '20px', zIndex: 999999,
      display: 'flex', flexDirection: 'column', gap: '6px', fontFamily: 'sans-serif',
      background: 'rgba(255,255,255,.97)', padding: '10px 12px',
      borderRadius: '8px', boxShadow: '0 4px 16px rgba(0,0,0,.15)',
      border: '1px solid #e5e6eb', minWidth: '190px',
    });
    const titleEl = document.createElement('div');
    titleEl.textContent = '📝 妙记文字记录导出';
    Object.assign(titleEl.style, {
      fontSize: '13px', fontWeight: '600', color: '#1f2329',
      textAlign: 'center', lineHeight: '1.4',
    });
    wrap.appendChild(titleEl);
    const hintEl = document.createElement('div');
    hintEl.textContent = '默认包含纪要、待办、章节和完整文字记录';
    Object.assign(hintEl.style, {
      fontSize: '11px', color: '#86909c', textAlign: 'center', marginBottom: '4px',
    });
    wrap.appendChild(hintEl);
    const mkBtn = (label, handler, bg) => {
      const b = document.createElement('button');
      b.textContent = label;
      Object.assign(b.style, {
        padding: '8px 14px', border: 'none', borderRadius: '6px',
        background: bg, color: '#fff', cursor: 'pointer', fontSize: '13px',
        boxShadow: '0 2px 8px rgba(0,0,0,.18)',
      });
      b.onclick = async () => {
        const buttons = wrap.querySelectorAll('button');
        buttons.forEach(button => { button.disabled = true; button.style.opacity = '.6'; });
        try { await handler(); }
        catch (e) { toast('失败：' + (e?.message || e)); console.error(e); }
        finally { buttons.forEach(button => { button.disabled = false; button.style.opacity = '1'; }); }
      };
      return b;
    };
    wrap.appendChild(mkBtn('复制 Markdown', copyMd, '#3370ff'));
    wrap.appendChild(mkBtn('下载 .md', downloadMd, '#00b96b'));
    document.body.appendChild(wrap);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', injectUI);
  else injectUI();
})();
