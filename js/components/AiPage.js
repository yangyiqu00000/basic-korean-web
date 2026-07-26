// js/components/AiPage.js — AI 练句页（砥砺）
;(function() {
  'use strict';
  if (typeof Vue === 'undefined') return;

  window.AiPageComponent = {
    template: '#ai-page-template',
    data: function() {
      return {
        input: '',
        loading: false,
        result: null,
        error: '',
        history: JSON.parse(localStorage.getItem('korean_ai_history') || '[]'),
        aiAvailable: window.aiServiceAvailable !== false
      };
    },
    methods: {
      submit: function() {
        var self = this;
        var text = this.input.trim();
        if (!text) return;

        this.loading = true;
        this.error = '';
        this.result = null;

        var baseUrl = window.TTS_BASE || 'http://127.0.0.1:1234';

        fetch(baseUrl + '/ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: text })
        })
        .then(function(resp) { return resp.json(); })
        .then(function(data) {
          self.loading = false;
          if (data.error) {
            self.error = data.error;
            return;
          }
          self.result = data;
          self.history.unshift({ input: text, result: data, time: new Date().toISOString() });
          localStorage.setItem('korean_ai_history', JSON.stringify(self.history));
          // 自动朗读整句
          setTimeout(function() {
            if (typeof window.speakKorean === 'function') {
              window.speakKorean(data.kr);
            }
          }, 350);
        })
        .catch(function(err) {
          self.loading = false;
          self.error = err.message || '请求失败，请确认 TTS+AI 服务已启动';
        });
      },
      clearHistory: function() {
        if (confirm('确认清除所有 AI 练句历史？')) {
          this.history = [];
          localStorage.removeItem('korean_ai_history');
        }
      },
      loadHistory: function(item) {
        this.input = item.input;
        this.result = item.result;
      },
      speak: function(text) {
        if (typeof window.speakKorean === 'function') {
          window.speakKorean(text);
        }
      },
      getElemClass: function(b) {
        if (typeof window.getElemClass === 'function') {
          return window.getElemClass(b);
        }
        return '';
      },
      escapeHtml: function(text) {
        if (typeof window.escapeHtml === 'function') {
          return window.escapeHtml(text);
        }
        var div = document.createElement('div');
        div.appendChild(document.createTextNode(text || ''));
        return div.innerHTML;
      },
      getRuleIcon: function(ruleNum) {
        if (typeof window.RULE_MAP !== 'undefined' && window.RULE_MAP[ruleNum]) {
          return window.RULE_MAP[ruleNum].icon + ' ' + window.RULE_MAP[ruleNum].name;
        }
        return '规则 ' + ruleNum;
      }
    }
  };
})();