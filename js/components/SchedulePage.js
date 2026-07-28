// js/components/SchedulePage.js — schedule-page页（Vue 容器 + 原始渲染）
;(function() {
  'use strict';
  if (typeof Vue === 'undefined') return;

  window.SchedulePageComponent = {
    template: '<div class="schedule-page-vue" v-once v-html="pageHtml"></div>',
    computed: {
      pageHtml: function() {
        if (typeof window.renderSchedule === 'function') return window.renderSchedule();
        return '';
      }
    }
  };
})();
