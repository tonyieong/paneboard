(function () {
  function createAiPane(context) {
    const {
      app, api, showToast, clearToken, renderLogin, paneTabs, activePaneTabId,
      findPaneState, confirmDialog, escapeHtml, escapeAttr, fileActionIcon, getToken, provider
    } = context;
    const MAX_AI_IMAGES = 4;
    const state = {
      get token() { return getToken(); },
      aiConnections: new Map(),
      aiCommands: new Map(),
      aiCapabilities: new Map(),
      // Pasted images waiting to go out with the next prompt, keyed by tab id.
      aiAttachments: new Map()
    };

    // One surface per tab, all but the active one hidden, mirroring how a
    // terminal pane stacks its tabs.
    function renderAiSurfaces(pane) {
      const activeId = activePaneTabId(pane);
      return paneTabs(pane).map((tab) => renderAiSurface(pane, tab, tab.id === activeId)).join('');
    }

    function renderAiSurface(pane, tab, isActive) {
      return `
        <div class="ai-surface ${tab.showThinking === false ? 'hide-thinking' : ''} ${tab.showTools === false ? 'hide-tools' : ''}"
             data-ai-tab="${tab.id}" data-ai-pane="${pane.id}" data-ai-provider="${provider}" ${isActive ? '' : 'hidden'}>
          <div class="ai-meta">
            <span class="ai-runtime" data-ai-runtime></span>
            <button type="button" class="ai-folder" data-ai-folder title="${escapeAttr(tab.cwd || '')}" aria-label="Working folder">${escapeHtml(aiFolderLabel(tab.cwd))}</button>
          </div>
          <div class="ai-scroll" data-ai-scroll>
            <div class="ai-log" data-ai-log role="log" aria-live="polite" aria-label="Conversation"></div>
          </div>
          <div class="ai-composer">
            <div class="ai-toolbar">
              <span class="ai-status" data-ai-status aria-live="polite"></span>
              <button type="button" class="ai-toggle" data-ai-toggle="thinking" aria-pressed="${tab.showThinking !== false}" aria-label="${escapeAttr(aiText('Show thinking'))}" title="${escapeAttr(aiText('Show thinking'))}">${fileActionIcon('thinking')}</button>
              <button type="button" class="ai-toggle" data-ai-toggle="tools" aria-pressed="${tab.showTools !== false}" aria-label="${escapeAttr(aiText('Show tool calls'))}" title="${escapeAttr(aiText('Show tool calls'))}">${fileActionIcon('tools')}</button>
              <button type="button" class="ai-retry" data-ai-retry hidden title="${escapeAttr(aiText('The agent stopped. Retry to start it again.'))}">${escapeHtml(aiText('Retry'))}</button>
              <button type="button" class="ai-icon-button" data-ai-interrupt aria-label="Interrupt" title="Interrupt">${fileActionIcon('interrupt')}</button>
              <button type="button" class="ai-icon-button danger" data-ai-clear aria-label="Clear conversation" title="Clear conversation">${fileActionIcon('delete')}</button>
              <button type="button" class="ai-icon-button" data-ai-sessions aria-label="${escapeAttr(aiText('Earlier conversations'))}" title="${escapeAttr(aiText('Earlier conversations'))}">${fileActionIcon('history')}</button>
            </div>
            <div class="ai-commands" data-ai-commands role="listbox" aria-label="${escapeAttr(aiText('Commands'))}" hidden></div>
            <div class="ai-attachments" data-ai-attachments hidden></div>
            <div class="ai-input-row">
              <textarea class="ai-input" data-ai-input rows="1" aria-label="${escapeAttr(aiText('Message'))}" placeholder="${escapeAttr(aiText(tab.provider === 'codex' ? 'Ask Codex, or type a / command' : 'Ask Claude, or type a / command'))}"></textarea>
              <button type="button" class="ai-send" data-ai-send aria-label="Send" title="Send">${fileActionIcon('send')}</button>
            </div>
          </div>
        </div>`;
    }

    // A small Markdown subset, enough for what an agent actually writes:
    // headings, rules, lists, quotes, tables and code. Everything is escaped
    // first and the replacements only ever run over escaped text, so no path
    // here can introduce markup.
    function renderMarkdown(value) {
      const blocks = [];
      const escaped = escapeHtml(String(value || ''))
        // Fenced code is lifted out before anything else so its contents are
        // never treated as Markdown.
        .replace(/```([\w-]*)\n?([\s\S]*?)```/g, (match, language, body) => {
          blocks.push(`<pre class="ai-code"${language ? ` data-lang="${escapeAttr(language)}"` : ''}><code>${body.replace(/\n$/, '')}</code></pre>`);
          return `\u0000${blocks.length - 1}\u0000`;
        });
      // Only these schemes become links, so a javascript: or data: URL an
      // agent echoes back stays plain text. The URL is already escaped, which
      // is exactly the form an href attribute needs.
      const link = (url, label) => (/^(https?:\/\/|mailto:)\S+$/i.test(url)
        ? `<a class="ai-link" href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`
        : label);
      // [label](url) and bare URLs share one pass, so a URL inside a link is
      // never linked a second time.
      const links = /\[([^\]\n]*)\]\(([^\s()]+)\)|((?:https?:\/\/|mailto:)[^\s()]+)/g;
      const inline = (text) => {
        // Code spans are set aside first so a URL or an asterisk inside one
        // stays literal.
        const spans = [];
        return text
          .replace(/`([^`]+)`/g, (match, code) => {
            spans.push(`<code>${code}</code>`);
            return `\u0001${spans.length - 1}\u0001`;
          })
          .replace(links, (match, label, url, bare) => {
            if (bare === undefined) return link(url, label || url);
            // Neither a neighbouring quote or bracket, which escaping left as an
            // entity, nor a sentence's full stop is part of the URL it touches.
            const trimmed = bare.replace(/(&(gt|lt|quot|#039);)+$/, '').replace(/[.,:!?]+$/, '');
            return link(trimmed, trimmed) + bare.slice(trimmed.length);
          })
          .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
          .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
          .replace(/~~([^~]+)~~/g, '<del>$1</del>')
          .replace(/\u0001(\d+)\u0001/g, (match, index) => spans[Number(index)]);
      };

      const lines = escaped.split('\n');
      const isPlaced = (line) => /^\u0000\d+\u0000$/.test(line.trim());
      const isRule = (line) => /^\s*([-*_])(\s*\1){2,}\s*$/.test(line);
      const isHeading = (line) => /^\s*#{1,6}\s+/.test(line);
      const isQuote = (line) => /^\s*&gt;\s?/.test(line);
      const isItem = (line) => /^\s*([-*]|\d+\.)\s+/.test(line);
      // Only pipe-delimited rows count, so ordinary prose containing a bar is
      // never mistaken for a table.
      const isRow = (line) => /^\s*\|.*\|\s*$/.test(line);
      const isDivider = (line) => /^\s*\|(\s*:?-+:?\s*\|)+\s*$/.test(line);
      const isTableStart = (index) => isRow(lines[index] || '') && isDivider(lines[index + 1] || '');
      const cells = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());
      const alignOf = (spec) => {
        if (/^:-+:$/.test(spec)) return ' class="ai-align-center"';
        if (/-+:$/.test(spec)) return ' class="ai-align-right"';
        return '';
      };
      const startsBlock = (index) => {
        const line = lines[index];
        if (line === undefined || !line.trim()) return true;
        return isPlaced(line) || isRule(line) || isHeading(line) || isQuote(line) || isItem(line) || isTableStart(index);
      };

      const out = [];
      let i = 0;
      while (i < lines.length) {
        const line = lines[i];
        const trimmed = line.trim();
        if (!trimmed) { i += 1; continue; }
        if (isPlaced(line)) { out.push(trimmed); i += 1; continue; }
        if (isRule(line)) { out.push('<hr class="ai-rule">'); i += 1; continue; }
        if (isHeading(line)) {
          const heading = /^\s*(#{1,6})\s+(.*)$/.exec(line);
          // Transcript headings start at h3 so they never outrank the pane title.
          const level = Math.min(heading[1].length + 2, 6);
          out.push(`<h${level} class="ai-heading">${inline(heading[2].replace(/\s+#+\s*$/, ''))}</h${level}>`);
          i += 1;
          continue;
        }
        if (isTableStart(i)) {
          const head = cells(lines[i]);
          const aligns = cells(lines[i + 1]).map(alignOf);
          i += 2;
          const body = [];
          while (i < lines.length && isRow(lines[i])) { body.push(cells(lines[i])); i += 1; }
          const row = (values, tag) => `<tr>${values.map((cell, index) => `<${tag}${aligns[index] || ''}>${inline(cell)}</${tag}>`).join('')}</tr>`;
          out.push(`<div class="ai-table-wrap"><table class="ai-table"><thead>${row(head, 'th')}</thead><tbody>${body.map((values) => row(values, 'td')).join('')}</tbody></table></div>`);
          continue;
        }
        if (isQuote(line)) {
          const quoted = [];
          while (i < lines.length && isQuote(lines[i])) { quoted.push(lines[i].trim().replace(/^&gt;\s?/, '')); i += 1; }
          out.push(`<blockquote class="ai-quote">${inline(quoted.join('<br>'))}</blockquote>`);
          continue;
        }
        if (isItem(line)) {
          const ordered = /^\s*\d+\./.test(line);
          const items = [];
          while (i < lines.length && isItem(lines[i]) && /^\s*\d+\./.test(lines[i]) === ordered) {
            items.push(`<li>${inline(lines[i].replace(/^\s*([-*]|\d+\.)\s+/, ''))}</li>`);
            i += 1;
          }
          out.push(ordered ? `<ol>${items.join('')}</ol>` : `<ul>${items.join('')}</ul>`);
          continue;
        }
        const paragraph = [];
        while (i < lines.length && !startsBlock(i)) { paragraph.push(lines[i].trim()); i += 1; }
        out.push(`<p>${inline(paragraph.join('<br>'))}</p>`);
      }
      return out.join('').replace(/\u0000(\d+)\u0000/g, (match, index) => blocks[Number(index)]);
    }

    // The transcript is excluded from the automatic DOM translation so the
    // agent's own words are never rewritten, so its fixed labels are translated
    // here instead.
    function aiText(value) {
      return window.Wps7I18n?.t(value) ?? value;
    }

    function aiEventLabel(event) {
      if (event.kind === 'tool_use') return event.tool?.name || aiText('Tool');
      if (event.kind === 'tool_result') return event.result?.isError ? aiText('Failed') : aiText('Result');
      return '';
    }

    function renderAiQuestion(event) {
      const question = event.question || {};
      const answered = Boolean(event.answer);
      const cancelled = Boolean(event.answer?.cancelled);
      const chosen = new Set(event.answer?.optionIds || []);
      const options = (question.options || []).map((option) => `
        <button type="button" class="ai-option ${chosen.has(option.id) ? 'chosen' : ''}"
                data-ai-option="${escapeAttr(option.id)}"
                data-ai-request="${escapeAttr(question.requestId)}"
                data-ai-group="${escapeAttr(question.groupId || '')}"
                ${answered ? 'disabled' : ''}>
          <span class="ai-option-label">${escapeHtml(option.label)}</span>
          ${option.hint ? `<span class="ai-option-hint">${escapeHtml(option.hint)}</span>` : ''}
        </button>`).join('');
      return `
        <div class="ai-question ${answered ? 'answered' : ''} ${cancelled ? 'cancelled' : ''}" data-ai-event="${event.id}">
          <p class="ai-question-prompt">${escapeHtml(question.prompt || '')}</p>
          ${question.detail ? `<pre class="ai-code"><code>${escapeHtml(question.detail)}</code></pre>` : ''}
          <div class="ai-options">${options}${question.allowFreeText && !answered
            ? `<button type="button" class="ai-option ai-option-other" data-ai-other
                    data-ai-request="${escapeAttr(question.requestId)}"
                    data-ai-group="${escapeAttr(question.groupId || '')}">
                <span class="ai-option-label">${escapeHtml(aiText('Other'))}</span>
                <span class="ai-option-hint">${escapeHtml(aiText('Answer in your own words'))}</span>
              </button>`
            : ''}</div>
          ${question.allowFreeText && !answered
            ? `<div class="ai-other" data-ai-other-row hidden>
                <input type="text" class="ai-other-input" data-ai-other-input
                       data-ai-request="${escapeAttr(question.requestId)}"
                       data-ai-group="${escapeAttr(question.groupId || '')}"
                       aria-label="${escapeAttr(aiText('Answer in your own words'))}"
                       placeholder="${escapeAttr(aiText('Answer in your own words'))}"
                       autocomplete="off">
                <button type="button" class="ai-send" data-ai-other-send aria-label="${escapeAttr(aiText('Send'))}" title="${escapeAttr(aiText('Send'))}">${fileActionIcon('send')}</button>
              </div>`
            : ''}
          ${cancelled ? `<p class="ai-question-note">${escapeHtml(aiText('This request expired when the CLI stopped.'))}</p>` : ''}
          ${answered && !cancelled ? `<p class="ai-question-note">${escapeHtml(aiText('You chose'))} ${escapeHtml((event.answer.labels || []).join(', '))}</p>` : ''}
        </div>`;
    }

    function aiAttachmentUrl(paneId, tabId, id) {
      const token = state.token ? `?token=${encodeURIComponent(state.token)}` : '';
      return `/api/panes/${encodeURIComponent(paneId)}/ai/tabs/${encodeURIComponent(tabId)}/attachments/${encodeURIComponent(id)}${token}`;
    }

    function renderAiAttachmentImages(event, paneId, tabId) {
      const images = Array.isArray(event.images) ? event.images : [];
      if (!images.length) return '';
      return `<div class="ai-attachment-images">${images.map((image) => `<img src="${escapeAttr(aiAttachmentUrl(paneId, tabId, image.id))}" alt="" loading="lazy">`).join('')}</div>`;
    }

    function renderAiEvent(event, paneId, tabId) {
      if (event.kind === 'question') {
        return renderAiQuestion(event);
      }
      if (event.kind === 'text') {
        return `<div class="ai-bubble ${event.role === 'user' ? 'user' : 'assistant'}" data-ai-event="${event.id}">${renderAiAttachmentImages(event, paneId, tabId)}${renderMarkdown(event.text)}</div>`;
      }
      if (event.kind === 'thinking') {
        return `<details class="ai-thinking" data-ai-event="${event.id}"><summary>${escapeHtml(aiText('Thinking'))}</summary><div>${renderMarkdown(event.text)}</div></details>`;
      }
      if (event.kind === 'tool_use' || event.kind === 'tool_result') {
        const body = event.kind === 'tool_use' ? event.tool?.input : event.result?.output;
        return `
          <details class="ai-tool ${event.result?.isError ? 'failed' : ''}" data-ai-event="${event.id}">
            <summary>${escapeHtml(aiEventLabel(event))}</summary>
            <pre class="ai-code"><code>${escapeHtml(body || '')}</code></pre>
          </details>`;
      }
      if (event.kind === 'error' || event.kind === 'notice') {
        return `<p class="ai-notice ${event.kind}" data-ai-event="${event.id}">${escapeHtml(event.text || '')}</p>`;
      }
      // A result frame only closes the turn; it has nothing of its own to show.
      return '';
    }

    function aiFolderLabel(cwd) {
      const text = String(cwd || '').replace(/[\\/]+$/, '');
      if (!text) return aiText('Folder');
      // The last segment is what identifies the folder at a glance; the full path
      // stays in the button's title.
      return text.split(/[\\/]/).pop() || text;
    }

    // A folder-only picker over the same /api/files endpoints the notepad save
    // dialog browses with. Typing a path works too, for when you already know it.
    function openFolderDialog({ title, startLocation = '' }) {
      return new Promise((resolve) => {
        document.querySelector('.app-modal-overlay')?.remove();
        const previousFocus = document.activeElement;
        const overlay = document.createElement('div');
        overlay.className = 'app-modal-overlay';
        overlay.innerHTML = `
          <div class="app-modal folder-picker" role="dialog" aria-modal="true" aria-label="${escapeAttr(title)}">
            <header class="app-modal-header">${escapeHtml(title)}</header>
            <div class="app-modal-body">
              <div class="folder-picker-location">
                <button class="file-command-button" type="button" data-folder-up aria-label="Up one level" title="Up one level">${fileActionIcon('up')}</button>
                <input type="text" data-folder-path value="${escapeAttr(startLocation)}" aria-label="Folder" autocomplete="off" autocapitalize="off" spellcheck="false">
                <button class="file-command-button" type="button" data-folder-refresh aria-label="Refresh" title="Refresh">${fileActionIcon('refresh')}</button>
              </div>
              <div class="folder-picker-list" data-folder-list role="listbox" aria-label="Folders"></div>
              <div class="app-modal-error" data-modal-error role="alert"></div>
            </div>
            <footer class="app-modal-footer">
              <button type="button" class="secondary" data-modal-cancel>Cancel</button>
              <button type="button" class="primary" data-modal-confirm>Use this folder</button>
            </footer>
          </div>`;
        document.body.appendChild(overlay);
        const pathInput = overlay.querySelector('[data-folder-path]');
        const list = overlay.querySelector('[data-folder-list]');
        const errorEl = overlay.querySelector('[data-modal-error]');
        let parentLocation = '';
        let loadToken = 0;

        const close = (result) => {
          document.removeEventListener('keydown', onKey, true);
          overlay.remove();
          previousFocus?.focus?.();
          resolve(result);
        };
        const onKey = (event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            close(null);
          }
        };
        const load = async (location) => {
          // Listing a folder is a round trip. Two guards keep it from fighting
          // the user: a newer request always wins, and a path typed while the
          // listing was in flight is never overwritten by the reply.
          const request = (loadToken += 1);
          const typedBefore = pathInput.value;
          errorEl.textContent = '';
          list.innerHTML = `<div class="folder-picker-empty">${escapeHtml(aiText('Loading…'))}</div>`;
          try {
            if (!location) {
              const drives = await api('/api/files/drives');
              if (request !== loadToken) return;
              parentLocation = '';
              if (pathInput.value === typedBefore) {
                pathInput.value = '';
              }
              renderEntries((drives.drives || []).map((drive) => ({ ...drive, drive: true })));
              return;
            }
            const result = await api(`/api/files?path=${encodeURIComponent(location)}`);
            if (request !== loadToken) return;
            parentLocation = result.parent || '';
            if (pathInput.value === typedBefore) {
              pathInput.value = result.path;
            }
            renderEntries((result.entries || []).filter((entry) => entry.type === 'directory'));
          } catch (error) {
            if (request !== loadToken) return;
            parentLocation = '';
            errorEl.textContent = error.message;
            list.innerHTML = `<div class="folder-picker-empty">${escapeHtml(aiText('Folder unavailable'))}</div>`;
          }
        };
        const renderEntries = (items) => {
          list.innerHTML = items.length ? items.map((item) => `
            <button type="button" role="option" data-folder-entry="${escapeAttr(item.path)}" title="${escapeAttr(item.path)}">
              ${fileActionIcon(item.drive ? 'drive' : 'folder')}
              <span>${escapeHtml(item.name)}</span>
            </button>`).join('') : `<div class="folder-picker-empty">${escapeHtml(aiText('No folders here'))}</div>`;
          list.querySelectorAll('[data-folder-entry]').forEach((button) => {
            button.onclick = () => load(button.dataset.folderEntry);
          });
        };

        overlay.querySelector('[data-folder-up]').onclick = () => load(parentLocation);
        overlay.querySelector('[data-folder-refresh]').onclick = () => load(pathInput.value.trim());
        overlay.querySelector('[data-modal-cancel]').onclick = () => close(null);
        overlay.querySelector('[data-modal-confirm]').onclick = () => close(pathInput.value.trim());
        pathInput.onkeydown = (event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            load(pathInput.value.trim());
          }
        };
        overlay.onmousedown = (event) => {
          if (event.target === overlay) close(null);
        };
        document.addEventListener('keydown', onKey, true);
        load(startLocation);
        pathInput.focus();
      });
    }

    async function changeAiFolder(surface) {
      const paneId = surface.dataset.aiPane;
      const tabId = surface.dataset.aiTab;
      const found = findPaneState(paneId);
      const tab = paneTabs(found?.pane || {}).find((candidate) => candidate.id === tabId);
      const chosen = await openFolderDialog({ title: 'Working folder', startLocation: tab?.cwd || '' });
      if (!chosen || chosen === tab?.cwd) {
        return;
      }
      try {
        const result = await api(`/api/panes/${paneId}/ai/tabs/${tabId}`, {
          method: 'PATCH',
          body: JSON.stringify({ cwd: chosen })
        });
        const next = result.cwd || chosen;
        if (tab) {
          tab.cwd = next;
        }
        setAiFolder(tabId, next);
      } catch (error) {
        showToast(error.message);
      }
    }

    function setAiFolder(tabId, cwd) {
      const button = aiSurface(tabId)?.querySelector('[data-ai-folder]');
      if (!button) return;
      button.textContent = aiFolderLabel(cwd);
      button.title = cwd || '';
    }

    // Typing a slash offers what this CLI actually accepts. The list comes from
    // the CLI itself, so a command that only means something in its own terminal
    // UI -- /plan, /status -- is never offered, because sending it would just
    // hand the text to the model.
    function aiComposerChoices(surface) {
      const input = surface.querySelector('[data-ai-input]');
      const value = input?.value || '';
      const capabilities = state.aiCapabilities.get(surface.dataset.aiTab) || {};
      const slash = /^\/([\w:-]*)$/.exec(value);
      if (slash) {
        const known = state.aiCommands.get(surface.dataset.aiTab) || { list: [], ready: false };
        const commands = (Array.isArray(known) ? known : known.list).map((command) => (typeof command === 'string'
          ? { name: command, description: '', argumentHint: '' }
          : command));
        return commands
          .filter((command) => command.name.toLowerCase().startsWith(slash[1].toLowerCase()))
          .map((command) => ({
            label: `/${command.name}`,
            argumentHint: command.argumentHint || '',
            description: command.description || '',
            completion: `/${command.name} `
          }));
      }
      const argument = /^\/(model|reasoning|mode|personality|permissions)\s+([\w.:-]*)$/.exec(value);
      if (argument) {
        const [, command, query] = argument;
        let choices = [];
        if (command === 'model') choices = capabilities.models || [];
        if (command === 'reasoning') {
          const models = capabilities.models || [];
          const activeModel = models.find((model) => model.id === capabilities.currentModel)
            || models.find((model) => model.isDefault);
          choices = activeModel?.reasoningEfforts || [];
        }
        if (command === 'personality') {
          choices = (capabilities.personalities || []).map((id) => ({ id }));
        }
        if (command === 'mode') choices = capabilities.collaborationModes || [];
        if (command === 'permissions') choices = capabilities.permissionProfiles || [];
        return choices
          .filter((item) => item.id.toLowerCase().startsWith(query.toLowerCase()))
          .map((item) => ({
            label: item.label || item.id,
            description: item.description || '',
            completion: `/${command} ${item.id}`
          }));
      }
      const skill = /(?:^|\s)\$([\w:-]*)$/.exec(value);
      if (skill) {
        const start = value.length - skill[1].length - 1;
        return (capabilities.skills || [])
          .filter((item) => item.name.toLowerCase().startsWith(skill[1].toLowerCase()))
          .map((item) => ({
            label: `$${item.name}`,
            description: item.description || '',
            completion: `${value.slice(0, start)}$${item.name} `
          }));
      }
      return [];
    }

    function updateAiCommandMenu(surface) {
      const menu = surface.querySelector('[data-ai-commands]');
      const input = surface.querySelector('[data-ai-input]');
      if (!menu || !input) return;
      const match = /^\/([\w:-]*)$/.exec(input.value);
      const known = state.aiCommands.get(surface.dataset.aiTab) || { list: [], ready: false };
      const commands = (Array.isArray(known) ? known : known.list).map((command) => (typeof command === 'string'
        ? { name: command, description: '', argumentHint: '' }
        : command));
      // Every match is listed; the box scrolls. Capping it hid most of what the
      // CLI offers with nothing to say so.
      const hits = match && commands.length
        ? commands.filter((command) => command.name.toLowerCase().startsWith(match[1].toLowerCase()))
          .map((command) => ({
            label: `/${command.name}`,
            argumentHint: command.argumentHint || '',
            description: command.description || '',
            completion: `/${command.name} `
          }))
        : aiComposerChoices(surface);
      if (match && !known.ready) {
        // The CLI takes a few seconds to answer with its list, and a blank menu
        // reads as though there were none.
        menu.innerHTML = `<p class="ai-command-note">${escapeHtml(aiText('Loading commands…'))}</p>`;
        menu.hidden = false;
        return;
      }
      if (!hits.length) {
        // Saying so beats sending it and letting the model answer "that is not
        // available", which is what a terminal-only command like /plan does.
        const unknown = match && match[1] && commands.length;
        menu.innerHTML = unknown
          ? `<p class="ai-command-note">/${escapeHtml(match[1])} ${escapeHtml(aiText('is not a command here, and will be sent as plain text.'))}</p>`
          : '';
        menu.hidden = !unknown;
        return;
      }
      menu.innerHTML = hits.map((command, index) => `<button type="button" class="ai-command ${index === 0 ? 'active' : ''}" role="option" aria-selected="${index === 0}" data-ai-command="${escapeAttr(command.label)}" data-ai-completion="${escapeAttr(command.completion)}">
        <span class="ai-command-name">${escapeHtml(command.label)}</span>
        ${command.argumentHint ? `<span class="ai-command-args" title="${escapeAttr(command.argumentHint)}">${escapeHtml(command.argumentHint)}</span>` : ''}
        ${command.description ? `<span class="ai-command-about ai-command-description" title="${escapeAttr(command.description)}">${escapeHtml(command.description)}</span>` : ''}
      </button>`).join('');
      menu.hidden = false;
    }

    function moveAiCommandChoice(surface, delta) {
      const menu = surface.querySelector('[data-ai-commands]');
      if (!menu || menu.hidden) return false;
      const items = [...menu.querySelectorAll('.ai-command')];
      if (!items.length) return false;
      const current = items.findIndex((item) => item.classList.contains('active'));
      const next = (current + delta + items.length) % items.length;
      items.forEach((item, index) => {
        item.classList.toggle('active', index === next);
        item.setAttribute('aria-selected', String(index === next));
      });
      items[next].scrollIntoView({ block: 'nearest' });
      return true;
    }

    function takeAiCommandChoice(surface) {
      const menu = surface.querySelector('[data-ai-commands]');
      if (!menu || menu.hidden) return false;
      const chosen = menu.querySelector('.ai-command.active') || menu.querySelector('.ai-command');
      if (!chosen) return false;
      const input = surface.querySelector('[data-ai-input]');
      // Slash commands leave room for arguments; catalog and skill choices carry
      // their exact replacement text from aiComposerChoices().
      input.value = chosen.dataset.aiCompletion;
      if (/^\/(model|reasoning|mode|personality|permissions)\s$/.test(input.value)) {
        updateAiCommandMenu(surface);
      } else {
        menu.hidden = true;
        menu.innerHTML = '';
      }
      input.focus();
      return true;
    }

    // The CLIs keep their own record of every conversation, and both accept an
    // id to continue one. This lists what they hold for the folder this tab runs
    // in, so a session can be picked up again even after the pane forgot it.
    async function openAiSessions(surface) {
      const paneId = surface.dataset.aiPane;
      const tabId = surface.dataset.aiTab;
      let result;
      try {
        result = await api(`/api/panes/${paneId}/ai/tabs/${tabId}/sessions`);
      } catch (error) {
        showToast(error.message);
        return;
      }
      const sessions = result.sessions || [];
      const chosen = await pickAiSession(sessions, result.cwd || {});
      if (!chosen) return;
      try {
        await api(`/api/panes/${paneId}/ai/tabs/${tabId}/session`, {
          method: 'POST',
          body: JSON.stringify({ sessionId: chosen.id, title: chosen.title })
        });
      } catch (error) {
        showToast(error.message);
      }
    }

    function pickAiSession(sessions, cwd) {
      return new Promise((resolve) => {
        document.querySelector('.app-modal-overlay')?.remove();
        const previousFocus = document.activeElement;
        const overlay = document.createElement('div');
        overlay.className = 'app-modal-overlay';
        const rows = sessions.length
          ? sessions.map((session, index) => `<button type="button" role="option" class="ai-session"
                    data-ai-session="${escapeAttr(session.id)}" data-ai-session-index="${index}">
              <span class="ai-session-title">${escapeHtml(session.title)}</span>
              <span class="ai-session-at">${escapeHtml(formatAiSessionDate(session.at))}</span>
            </button>`).join('')
          : `<p class="folder-picker-empty">${escapeHtml(aiText('No earlier conversations for this folder.'))}</p>`;
        overlay.innerHTML = `
          <div class="app-modal folder-picker" role="dialog" aria-modal="true" aria-label="${escapeAttr(aiText('Earlier conversations'))}">
            <header class="app-modal-header">${escapeHtml(aiText('Earlier conversations'))}</header>
            <div class="app-modal-body">
              <p class="ai-session-folder">${escapeHtml(cwd)}</p>
              <div class="ai-session-list" role="listbox">${rows}</div>
              <p class="ai-session-note">${escapeHtml(aiText('The agent keeps these messages; this tab shows only what happens next.'))}</p>
            </div>
            <footer class="app-modal-footer">
              <button type="button" class="secondary" data-modal-cancel>${escapeHtml(aiText('Cancel'))}</button>
            </footer>
          </div>`;
        document.body.appendChild(overlay);
        const close = (value) => {
          document.removeEventListener('keydown', onKey, true);
          overlay.remove();
          previousFocus?.focus?.();
          resolve(value);
        };
        const onKey = (event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            close(null);
          }
        };
        overlay.querySelector('[data-modal-cancel]').onclick = () => close(null);
        overlay.onmousedown = (event) => {
          if (event.target === overlay) close(null);
        };
        overlay.querySelectorAll('[data-ai-session]').forEach((button) => {
          button.onclick = () => close(sessions[Number(button.dataset.aiSessionIndex)]);
        });
        document.addEventListener('keydown', onKey, true);
      });
    }

    function formatAiSessionDate(value) {
      const at = new Date(value);
      if (Number.isNaN(at.getTime())) return String(value || '');
      const today = new Date();
      const sameDay = at.toDateString() === today.toDateString();
      return sameDay
        ? at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : at.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    }

    function aiSurface(tabId) {
      return app.querySelector(`[data-ai-provider="${provider}"][data-ai-tab="${tabId}"]`);
    }

    // Reveals a fresh assistant reply a chunk of characters at a time instead of
    // all at once. Frame count is capped so a long reply still finishes quickly
    // rather than crawling; reduced motion skips straight to the final text.
    function typeAiText(el, text, { onStep, onDone } = {}) {
      if (!text || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
        el.textContent = text;
        onDone?.();
        return;
      }
      const total = text.length;
      const charsPerFrame = Math.max(1, Math.ceil(total / 120));
      let shown = 0;
      const step = () => {
        shown = Math.min(total, shown + charsPerFrame);
        el.textContent = text.slice(0, shown);
        onStep?.();
        if (shown < total) {
          requestAnimationFrame(step);
        } else {
          onDone?.();
        }
      };
      requestAnimationFrame(step);
    }

    // `streaming` is true when the CLI is still generating this reply and more
    // `patch` messages for it are coming; it is absent for history replay and
    // for a reply that arrived complete with no prior deltas.
    function appendAiEvent(tabId, event, streaming) {
      const surface = aiSurface(tabId);
      const log = surface?.querySelector('[data-ai-log]');
      const scroller = surface?.querySelector('[data-ai-scroll]');
      if (!log || !scroller) return;
      // Only follow the conversation when the reader was already at the end.
      const atBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 40;
      const follow = () => { if (atBottom) scroller.scrollTop = scroller.scrollHeight; };
      if (event.kind === 'text' && event.role === 'assistant') {
        const bubble = document.createElement('div');
        bubble.className = 'ai-bubble assistant typing';
        bubble.dataset.aiEvent = event.id;
        log.appendChild(bubble);
        follow();
        if (streaming) {
          // Real tokens are already arriving live; showing only as much as the
          // CLI has actually generated is the streaming effect, no animation.
          bubble.textContent = event.text || '';
          follow();
          return;
        }
        typeAiText(bubble, event.text || '', {
          onStep: follow,
          onDone: () => {
            bubble.classList.remove('typing');
            bubble.innerHTML = renderMarkdown(event.text || '');
            follow();
          }
        });
        return;
      }
      const html = renderAiEvent(event, surface.dataset.aiPane, tabId);
      if (!html) return;
      log.insertAdjacentHTML('beforeend', html);
      follow();
    }

    function patchAiEvent(tabId, id, patch) {
      const surface = aiSurface(tabId);
      const node = surface?.querySelector(`[data-ai-event="${id}"]`);
      if (!node) return;
      if (patch.text !== undefined) {
        const scroller = surface.querySelector('[data-ai-scroll]');
        const atBottom = scroller && scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 40;
        if (patch.done) {
          node.classList.remove('typing');
          node.innerHTML = renderMarkdown(patch.text);
        } else {
          node.textContent = patch.text;
        }
        if (atBottom) scroller.scrollTop = scroller.scrollHeight;
        return;
      }
      const answer = patch.answer;
      node.classList.add('answered');
      if (answer?.cancelled) {
        node.classList.add('cancelled');
        node.querySelector('.ai-question-note')?.remove();
        node.insertAdjacentHTML('beforeend', `<p class="ai-question-note">${escapeHtml(aiText('This request expired when the CLI stopped.'))}</p>`);
      } else if (answer) {
        node.insertAdjacentHTML('beforeend', `<p class="ai-question-note">${escapeHtml(aiText('You chose'))} ${escapeHtml((answer.labels || []).join(', '))}</p>`);
        for (const id of answer.optionIds || []) {
          node.querySelector(`[data-ai-option="${CSS.escape(id)}"]`)?.classList.add('chosen');
        }
      }
      node.querySelectorAll('.ai-option').forEach((button) => { button.disabled = true; });
    }

    function setAiStatus(tabId, status) {
      const label = aiSurface(tabId)?.querySelector('[data-ai-status]');
      if (!label) return;
      // 'starting' says nothing useful: the CLI stays silent until it is given a
      // prompt, so there is nothing to wait for, and a real failure arrives as an
      // error message of its own.
      const wording = {
        starting: '', busy: aiText('Working…'), waiting: aiText('Waiting for you'), idle: '', stopped: aiText('Stopped')
      };
      label.textContent = wording[status] ?? '';
      const surface = aiSurface(tabId);
      surface?.classList.toggle('stopped', status === 'stopped');
      const retry = surface?.querySelector('[data-ai-retry]');
      if (retry) {
        retry.hidden = status !== 'stopped';
      }
    }

    function setAiRuntime(tabId, model, effort) {
      const label = aiSurface(tabId)?.querySelector('[data-ai-runtime]');
      if (!label) return;
      const modelText = model || '—';
      const effortText = effort || '—';
      label.textContent = `${modelText} · ${effortText}`;
      label.title = `Model: ${model || 'CLI default'} · Reasoning: ${effort || 'CLI default'}`;
    }

    function mountAiPane(pane) {
      for (const tab of paneTabs(pane)) {
        mountAiTab(pane.id, tab.id);
      }
    }

    function mountAiTab(paneId, tabId) {
      if (state.aiConnections.has(tabId)) {
        return;
      }
      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      let ws = null;
      let disposed = false;
      let reconnectTimer = 0;
      let reconnectDelay = 500;
      const queue = [];

      const send = (message) => {
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(message));
        } else {
          queue.push(message);
        }
      };

      const connect = () => {
        if (disposed) return;
        const socket = new WebSocket(`${protocol}//${location.host}/ws?paneId=${encodeURIComponent(tabId)}&mode=ai&token=${encodeURIComponent(state.token)}`);
        ws = socket;
        socket.onopen = () => {
          reconnectDelay = 500;
          while (queue.length) {
            socket.send(JSON.stringify(queue.shift()));
          }
        };
        socket.onmessage = (event) => {
          const message = JSON.parse(event.data);
          if (message.type === 'hello') {
            const log = aiSurface(tabId)?.querySelector('[data-ai-log]');
            const scroller = aiSurface(tabId)?.querySelector('[data-ai-scroll]');
            if (log) {
              // A question the server no longer lists as pending died with its
              // CLI, so it is drawn as expired rather than as live buttons.
              const pending = new Set(message.pending || []);
              const events = (message.events || []).map((item) => (item.kind === 'question' && !item.answer && !pending.has(item.question.requestId)
                ? { ...item, answer: { cancelled: true } }
                : item));
              log.innerHTML = events.map((item) => renderAiEvent(item, paneId, tabId)).join('');
              if (scroller) scroller.scrollTop = scroller.scrollHeight;
            }
            state.aiCommands.set(tabId, { list: message.commands || [], ready: Boolean(message.commandsReady) });
            state.aiCapabilities.set(tabId, message.capabilities || {});
            setAiFolder(tabId, message.cwd || '');
            setAiRuntime(tabId, message.model, message.effort);
            setAiStatus(tabId, message.status);
            return;
          }
          if (message.type === 'event') {
            appendAiEvent(tabId, message.event, message.streaming);
            return;
          }
          if (message.type === 'commands') {
            state.aiCommands.set(tabId, { list: message.commands || [], ready: message.ready !== false });
            // The list can arrive while the menu is already open on "loading".
            const surface = aiSurface(tabId);
            if (surface) updateAiCommandMenu(surface);
            return;
          }
          if (message.type === 'capabilities') {
            state.aiCapabilities.set(tabId, message.capabilities || {});
            updateAiCommandMenu(aiSurface(tabId));
            return;
          }
          if (message.type === 'patch') {
            patchAiEvent(tabId, message.id, message);
            return;
          }
          if (message.type === 'status') {
            setAiRuntime(tabId, message.model, message.effort);
            setAiStatus(tabId, message.status);
            return;
          }
          if (message.type === 'cleared') {
            const log = aiSurface(tabId)?.querySelector('[data-ai-log]');
            if (log) log.innerHTML = '';
            return;
          }
          if (message.type === 'error') {
            showToast(message.message);
          }
        };
        socket.onclose = (event) => {
          if (disposed || socket !== ws) return;
          if (event.code === 1008) {
            showToast(event.reason || 'AI connection rejected.');
            if (event.reason === 'Login required') {
              clearToken();
              renderLogin();
            }
            return;
          }
          reconnectTimer = window.setTimeout(connect, reconnectDelay);
          reconnectDelay = Math.min(reconnectDelay * 2, 10000);
        };
      };
      connect();

      state.aiConnections.set(tabId, {
        paneId,
        send,
        dispose() {
          disposed = true;
          window.clearTimeout(reconnectTimer);
          ws?.close();
        }
      });
    }

    function disposeAiPanes() {
      for (const connection of state.aiConnections.values()) {
        connection.dispose();
      }
      state.aiConnections.clear();
      state.aiCommands.clear();
      state.aiCapabilities.clear();
      state.aiAttachments.clear();
    }

    function renderAiAttachments(surface) {
      const container = surface.querySelector('[data-ai-attachments]');
      if (!container) return;
      const list = state.aiAttachments.get(surface.dataset.aiTab) || [];
      container.hidden = !list.length;
      container.innerHTML = list.map((image, index) => `
        <span class="ai-attachment">
          <img src="${escapeAttr(image.preview)}" alt="">
          <button type="button" class="ai-attachment-remove" data-ai-attachment-remove="${index}" aria-label="${escapeAttr(aiText('Remove image'))}" title="${escapeAttr(aiText('Remove image'))}">${fileActionIcon('close')}</button>
        </span>`).join('');
    }

    // Vision models get nothing extra past this resolution, and it keeps a
    // pasted screenshot from turning into a multi-megabyte upload -- both for
    // the CLI call and for its permanent copy on disk (see AiManager.saveAttachments).
    const MAX_AI_IMAGE_DIMENSION = 1568;

    // Re-encodes as JPEG at a fixed quality, so a pasted image is a few hundred
    // KB at most regardless of its source format or size. Chat screenshots
    // rarely depend on transparency, so trading it away here is a fair swap for
    // a predictable, bounded upload.
    function resizeAiImage(dataUrl, callback) {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, MAX_AI_IMAGE_DIMENSION / Math.max(img.width, img.height));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        const resized = canvas.toDataURL('image/jpeg', 0.85);
        const match = /^data:([^;]+);base64,(.+)$/.exec(resized);
        callback(match ? { mimeType: match[1], data: match[2], preview: resized } : null);
      };
      img.onerror = () => callback(null);
      img.src = dataUrl;
    }

    // Ctrl+V and a right-click "Paste" both fire the same DOM paste event on a
    // focused text field, so one listener covers both entry points the task
    // asked for.
    function handleAiPaste(event, surface) {
      const items = [...(event.clipboardData?.items || [])].filter((item) => item.kind === 'file' && item.type.startsWith('image/'));
      if (!items.length) return;
      event.preventDefault();
      const tabId = surface.dataset.aiTab;
      for (const item of items) {
        const list = state.aiAttachments.get(tabId) || [];
        if (list.length >= MAX_AI_IMAGES) break;
        const file = item.getAsFile();
        if (!file) continue;
        const reader = new FileReader();
        reader.onload = () => {
          resizeAiImage(String(reader.result || ''), (resized) => {
            if (!resized) return;
            const current = state.aiAttachments.get(tabId) || [];
            if (current.length >= MAX_AI_IMAGES) return;
            current.push(resized);
            state.aiAttachments.set(tabId, current);
            renderAiAttachments(surface);
          });
        };
        reader.readAsDataURL(file);
      }
    }

    function sendAiPrompt(surface) {
      const input = surface.querySelector('[data-ai-input]');
      const text = input?.value.trim() || '';
      const tabId = surface.dataset.aiTab;
      const images = state.aiAttachments.get(tabId) || [];
      if (!text && !images.length) return;
      state.aiConnections.get(tabId)?.send({
        type: 'prompt',
        text,
        ...(images.length ? { images: images.map(({ mimeType, data }) => ({ mimeType, data })) } : {})
      });
      input.value = '';
      input.style.height = '';
      state.aiAttachments.delete(tabId);
      renderAiAttachments(surface);
      updateAiCommandMenu(surface);
    }

    async function clearAiHistory(surface) {
      const confirmed = await confirmDialog(
        'Clear conversation',
        'This deletes every message in this tab and starts the agent over with no memory of them.',
        { danger: true, confirmLabel: 'Clear' }
      );
      if (!confirmed) return;
      try {
        await api(`/api/panes/${surface.dataset.aiPane}/ai/tabs/${surface.dataset.aiTab}/messages`, { method: 'DELETE' });
      } catch (error) {
        showToast(error.message);
      }
    }

    function wireAiPane(root) {
      // Accepts either a container to search or a single surface, so a tab added
      // to a live pane can be wired without re-binding its siblings.
      const surfaces = root.matches?.(`.ai-surface[data-ai-provider="${provider}"]`)
        ? [root]
        : root.querySelectorAll(`.ai-surface[data-ai-provider="${provider}"]`);
      surfaces.forEach((surface) => {
        const input = surface.querySelector('[data-ai-input]');
        if (input) {
          input.addEventListener('keydown', (event) => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              if (moveAiCommandChoice(surface, event.key === 'ArrowDown' ? 1 : -1)) {
                event.preventDefault();
              }
              return;
            }
            if (event.key === 'Escape') {
              const menu = surface.querySelector('[data-ai-commands]');
              if (menu && !menu.hidden) {
                event.preventDefault();
                menu.hidden = true;
              }
              return;
            }
            if (event.key === 'Tab' && takeAiCommandChoice(surface)) {
              event.preventDefault();
              return;
            }
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              // Enter completes the highlighted command first; a second Enter
              // sends it, once any arguments have been typed.
              if (takeAiCommandChoice(surface)) return;
              sendAiPrompt(surface);
            }
          });
          // Grows with the message rather than scrolling a one-line box.
          input.addEventListener('input', () => {
            input.style.height = 'auto';
            input.style.height = `${Math.min(input.scrollHeight, 160)}px`;
            updateAiCommandMenu(surface);
          });
          input.addEventListener('paste', (event) => handleAiPaste(event, surface));
        }
        surface.querySelector('[data-ai-attachments]')?.addEventListener('click', (event) => {
          const button = event.target.closest('[data-ai-attachment-remove]');
          if (!button) return;
          const tabId = surface.dataset.aiTab;
          const list = state.aiAttachments.get(tabId) || [];
          list.splice(Number(button.dataset.aiAttachmentRemove), 1);
          state.aiAttachments.set(tabId, list);
          renderAiAttachments(surface);
        });
        surface.querySelector('[data-ai-send]')?.addEventListener('click', () => sendAiPrompt(surface));
        surface.querySelector('[data-ai-interrupt]')?.addEventListener('click', () => {
          state.aiConnections.get(surface.dataset.aiTab)?.send({ type: 'interrupt' });
        });
        surface.querySelector('[data-ai-retry]')?.addEventListener('click', () => {
          state.aiConnections.get(surface.dataset.aiTab)?.send({ type: 'restart' });
          setAiStatus(surface.dataset.aiTab, 'starting');
        });
        surface.querySelector('[data-ai-clear]')?.addEventListener('click', () => clearAiHistory(surface));
        surface.querySelector('[data-ai-folder]')?.addEventListener('click', () => changeAiFolder(surface));
        surface.querySelector('[data-ai-sessions]')?.addEventListener('click', () => openAiSessions(surface));
        surface.querySelectorAll('[data-ai-toggle]').forEach((button) => {
          button.addEventListener('click', () => toggleAiVisibility(surface, button));
        });
        const sendAnswer = (node, payload) => {
          state.aiConnections.get(surface.dataset.aiTab)?.send({
            type: 'answer',
            requestId: node.dataset.aiRequest,
            groupId: node.dataset.aiGroup,
            optionIds: [],
            ...payload
          });
          // The server confirms with a patch; disabling now stops a second click
          // from racing it.
          const question = node.closest('.ai-question');
          question?.querySelectorAll('.ai-option').forEach((button) => { button.disabled = true; });
          const row = question?.querySelector('[data-ai-other-row]');
          if (row) {
            row.hidden = true;
          }
        };

        surface.querySelector('[data-ai-commands]')?.addEventListener('click', (event) => {
          const item = event.target.closest('[data-ai-command]');
          if (!item) return;
          item.parentElement.querySelectorAll('.ai-command').forEach((node) => node.classList.remove('active'));
          item.classList.add('active');
          takeAiCommandChoice(surface);
        });

        surface.addEventListener('click', (event) => {
          const other = event.target.closest('[data-ai-other]');
          if (other && !other.disabled) {
            // "Other" is a choice the CLI never lists but always accepts; it
            // opens the box rather than answering by itself.
            const row = other.closest('.ai-question')?.querySelector('[data-ai-other-row]');
            if (row) {
              row.hidden = false;
              row.querySelector('[data-ai-other-input]')?.focus();
            }
            return;
          }
          const send = event.target.closest('[data-ai-other-send]');
          if (send) {
            const input = send.closest('[data-ai-other-row]')?.querySelector('[data-ai-other-input]');
            if (input?.value.trim()) {
              sendAnswer(input, { text: input.value.trim() });
            }
            return;
          }
          const option = event.target.closest('[data-ai-option]');
          if (!option || option.disabled) return;
          sendAnswer(option, { optionIds: [option.dataset.aiOption] });
        });

        surface.addEventListener('keydown', (event) => {
          const input = event.target.closest('[data-ai-other-input]');
          if (!input || event.key !== 'Enter') return;
          event.preventDefault();
          if (input.value.trim()) {
            sendAnswer(input, { text: input.value.trim() });
          }
        });
      });
    }

    function toggleAiVisibility(surface, button) {
      const kind = button.dataset.aiToggle;
      const next = button.getAttribute('aria-pressed') !== 'true';
      button.setAttribute('aria-pressed', String(next));
      surface.classList.toggle(kind === 'thinking' ? 'hide-thinking' : 'hide-tools', !next);
      const found = findPaneState(surface.dataset.aiPane);
      const tab = paneTabs(found?.pane || {}).find((candidate) => candidate.id === surface.dataset.aiTab);
      if (tab) {
        tab[kind === 'thinking' ? 'showThinking' : 'showTools'] = next;
      }
      api(`/api/panes/${surface.dataset.aiPane}/ai/tabs/${surface.dataset.aiTab}`, {
        method: 'PATCH',
        body: JSON.stringify(kind === 'thinking' ? { showThinking: next } : { showTools: next })
      }).catch(() => {});
    }


    function disposeTab(tabId) {
      state.aiConnections.get(tabId)?.dispose();
      state.aiConnections.delete(tabId);
      state.aiCommands.delete(tabId);
      state.aiCapabilities.delete(tabId);
    }

    return {
      renderSurfaces: renderAiSurfaces,
      renderSurface: renderAiSurface,
      mountPane: mountAiPane,
      mountTab: mountAiTab,
      wire: wireAiPane,
      disposeAll: disposeAiPanes,
      disposeTab,
      surface: aiSurface
    };
  }

  window.Wps7AiPanePlugins = window.Wps7AiPanePlugins || {};
  window.Wps7AiPanePlugins.claude = { create: createAiPane };
})();
