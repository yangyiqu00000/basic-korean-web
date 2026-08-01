// js/components/WordListPage.js — 词句表页（Vue 容器 + 原始渲染）
;(function() {
  'use strict';
  if (typeof Vue === 'undefined') return;

  window.WordListPageComponent = {
    template: '<div class="wordlist-page-vue" v-once v-html="pageHtml"></div>',
    computed: {
      pageHtml: function() {
        if (typeof window.renderWordList === 'function') {
          return window.renderWordList();
        }
        return '';
      }
    }
  };
})();
