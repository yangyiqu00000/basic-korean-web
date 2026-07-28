// js/components/TrainingPage.js — training-page页（Vue 容器 + 原始渲染）
;(function() {
  'use strict';
  if (typeof Vue === 'undefined') return;

  window.TrainingPageComponent = {
    template: '<div class="training-page-vue" v-once v-html="pageHtml"></div>',
    computed: {
      pageHtml: function() {
        if (typeof window.renderTraining === 'function') return window.renderTraining();
        return '';
      }
    }
  };
})();
