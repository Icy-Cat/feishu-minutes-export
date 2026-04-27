// ==UserScript==
// @name         飞书妙记文字记录导出
// @name:en      Feishu Minutes Transcript Export
// @namespace    https://github.com/Icy-Cat/feishu-minutes-export
// @version      0.1.2
// @description  一键把飞书妙记 / Lark Minutes 的字幕文字记录导出为 Markdown（复制到剪贴板或下载 .md 文件）
// @description:en One-click export Feishu / Lark Minutes transcript to Markdown (copy or download).
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

  const cache = {
    subtitles: null,   // /minutes/api/subtitles_v2 响应
    speakers: null,    // /minutes/api/speakers 响应
  };

  // ---- 1. 拦截 fetch ----
  const _fetch = window.fetch;
  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : input?.url || '';
    const resp = await _fetch.apply(this, arguments);
    try {
      if (/\/minutes\/api\/subtitles_v2\b/.test(url)) {
        resp.clone().json().then(j => { if (j?.code === 0) cache.subtitles = j.data; }).catch(() => {});
      } else if (/\/minutes\/api\/speakers\b/.test(url)) {
        resp.clone().json().then(j => { if (j?.code === 0) cache.speakers = j.data; }).catch(() => {});
      }
    } catch (_) {}
    return resp;
  };

  // ---- 2. 拦截 XHR（保险）----
  const _open = XMLHttpRequest.prototype.open;
  const _send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__url = url;
    return _open.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
    this.addEventListener('load', () => {
      try {
        const url = this.__url || '';
        if (!/\/minutes\/api\/(subtitles_v2|speakers)\b/.test(url)) return;
        const j = JSON.parse(this.responseText);
        if (j?.code !== 0) return;
        if (url.includes('subtitles_v2')) cache.subtitles = j.data;
        else if (url.includes('speakers')) cache.speakers = j.data;
      } catch (_) {}
    });
    return _send.apply(this, arguments);
  };

  // ---- 3. 工具函数 ----
  const getToken = () => {
    const m = location.pathname.match(/\/minutes\/([^/?#]+)/);
    return m ? m[1] : null;
  };

  const fmtTime = (ms) => {
    const s = Math.floor(Number(ms) / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return h > 0 ? `${pad(h)}:${pad(m)}:${pad(ss)}` : `${pad(m)}:${pad(ss)}`;
  };

  // 主动拉取（接口未触发时的保底）
  async function fetchAll() {
    const token = getToken();
    if (!token) throw new Error('未识别 object_token');
    const base = `${location.origin}/minutes/api`;
    const lang = 'zh_cn';
    // 1) 段落 ID 列表（拿到 total / 第一个 pid）
    const pidRes = await fetch(`${base}/subtitles/paragraph-ids?page_size=10000&page_num=0&object_token=${token}&language=${lang}`).then(r => r.json());
    const list = pidRes?.data?.list || [];
    if (!list.length) throw new Error('paragraph-ids 为空');
    const total = pidRes.data.total || list.length;
    const firstPid = list[0].pid;
    // 2) 字幕（一次拉满）
    const subRes = await fetch(`${base}/subtitles_v2?paragraph_id=${firstPid}&size=${total}&translate_lang=default&is_fluent=false&filter_speaker=true&object_token=${token}&language=${lang}`).then(r => r.json());
    if (subRes?.code !== 0) throw new Error('subtitles_v2 失败');
    cache.subtitles = subRes.data;
    // 3) 说话人
    const spkRes = await fetch(`${base}/speakers?size=10000&translate_lang=default&object_token=${token}&language=${lang}`).then(r => r.json());
    if (spkRes?.code === 0) cache.speakers = spkRes.data;
  }

  function buildMarkdown() {
    if (!cache.subtitles) throw new Error('字幕数据未抓到');
    const sub = cache.subtitles;
    const spk = cache.speakers || {};
    const pidToUid = spk.paragraph_to_speaker || {};
    const userMap = spk.speaker_info_map || {};

    const title = (document.title || '飞书妙记').replace(/\s*-\s*飞书.*$/, '').trim() || 'minutes';

    const lines = [`# ${title}`, ''];
    let lastSpeaker = null;

    for (const p of sub.paragraphs || []) {
      if (!p.sentences?.length) continue;
      const pid = p.sentences[0].sid;
      const uid = pidToUid[pid];
      const speaker = (uid && userMap[uid]?.user_name) || '未知发言人';
      const startMs = p.sentences[0].start_time ?? p.start_time ?? 0;
      const text = p.sentences
        .map(s => (s.contents || []).map(c => c.content).join(''))
        .join('');
      if (!text.trim()) continue;

      if (speaker !== lastSpeaker) {
        if (lastSpeaker !== null) lines.push('');
        lines.push(`## ${speaker}`);
        lastSpeaker = speaker;
      }
      lines.push(`- [${fmtTime(startMs)}] ${text.trim()}`);
    }
    return lines.join('\n');
  }

  async function ensureData() {
    if (cache.subtitles && cache.speakers) return;
    await fetchAll();
  }

  async function copyMd() {
    await ensureData();
    const md = buildMarkdown();
    await navigator.clipboard.writeText(md);
    toast(`已复制 ${md.length} 字`);
  }

  async function downloadMd() {
    await ensureData();
    const md = buildMarkdown();
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

  // ---- 4. UI ----
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
      display: 'flex', flexDirection: 'column', gap: '6px',
      fontFamily: 'sans-serif',
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
    hintEl.textContent = '将整段字幕导出为 Markdown';
    Object.assign(hintEl.style, {
      fontSize: '11px', color: '#86909c', textAlign: 'center',
      marginBottom: '4px',
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
        b.disabled = true;
        const oldBg = b.style.background;
        b.style.opacity = '.6';
        try { await handler(); }
        catch (e) { toast('失败：' + (e?.message || e)); console.error(e); }
        finally { b.disabled = false; b.style.opacity = '1'; b.style.background = oldBg; }
      };
      return b;
    };

    wrap.appendChild(mkBtn('复制 Markdown', copyMd, '#3370ff'));
    wrap.appendChild(mkBtn('下载 .md', downloadMd, '#00b96b'));
    document.body.appendChild(wrap);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectUI);
  } else {
    injectUI();
  }
})();
