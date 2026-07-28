// js/components/SchedulePage.js — schedule-page页（Vue 容器 + 原始渲染）
;(function() {
  'use strict';
  if (typeof Vue === 'undefined') return;

  window.SchedulePageComponent = {
    template: '<div class="schedule-page-vue"></div>',
    mounted: function() {
      var fn = window['renderSchedulePage'];
      if (typeof fn === 'function') {
        this.$el.innerHTML = fn();
      }
    }
  };
})();
