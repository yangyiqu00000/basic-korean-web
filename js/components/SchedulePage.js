// js/components/SchedulePage.js — 日课表（润物）
;(function() {
  'use strict';
  if (typeof Vue === 'undefined') return;

  window.SchedulePageComponent = {
    template: '#schedule-page-template',
    data: function() {
      return {
        schedule: window.SCHEDULE || [],
        progress: JSON.parse(localStorage.getItem('korean_progress') || '{}')
      };
    },
    computed: {
      totalCount: function() {
        return this.schedule.reduce(function(s, d) { return s + d.tasks.length; }, 0);
      },
      doneCount: function() {
        return Object.values(this.progress).filter(function(v) { return v; }).length;
      },
      percent: function() {
        return this.totalCount > 0 ? Math.round(this.doneCount / this.totalCount * 100) : 0;
      }
    },
    methods: {
      toggleCheck: function(dayIdx, taskIdx) {
        var key = dayIdx + '-' + taskIdx;
        this.progress[key] = !this.progress[key];
        localStorage.setItem('korean_progress', JSON.stringify(this.progress));
      },
      isDone: function(dayIdx, taskIdx) {
        return this.progress[dayIdx + '-' + taskIdx] || false;
      }
    }
  };
})();