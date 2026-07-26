// js/components/StatsPanel.js — 统计弹窗 Vue 组件
;(function() {
  'use strict';
  if (typeof Vue === 'undefined') return;

  window.StatsPanelComponent = {
    template: '#stats-panel-template',
    data: function() {
      return {
        isVisible: false,
        scheduleTotal: 0,
        scheduleDone: 0,
        trainingTotal: 43,
        trainingDoneCount: 0,
        aiHistoryCount: 0,
        sceneHistoryCount: 0,
        appVersion: window.APP_VERSION || '1.0.0',
        lastCommit: window.APP_LAST_COMMIT || ''
      };
    },
    methods: {
      open: function() {
        this.refreshData();
        this.isVisible = true;
      },
      close: function() {
        this.isVisible = false;
      },
      refreshData: function() {
        var progress = JSON.parse(localStorage.getItem('korean_progress') || '{}');
        var trainingDone = JSON.parse(localStorage.getItem('korean_training_done') || '{}');
        var aiHistory = JSON.parse(localStorage.getItem('korean_ai_history') || '[]');
        var sceneHistory = JSON.parse(localStorage.getItem('korean_scene_history') || '[]');

        if (window.SCHEDULE) {
          this.scheduleTotal = window.SCHEDULE.reduce(function(s, d) { return s + d.tasks.length; }, 0);
        }
        this.scheduleDone = Object.values(progress).filter(function(v) { return v; }).length;
        this.trainingDoneCount = Object.values(trainingDone).filter(function(v) { return v; }).length;
        this.aiHistoryCount = aiHistory.length;
        this.sceneHistoryCount = sceneHistory.length;
      },
      clearData: function(key, name) {
        if (confirm('确认清除' + name + '？此操作不可撤销。')) {
          if (typeof window.clearData === 'function') {
            window.clearData(key, name);
          } else {
            localStorage.removeItem(key);
          }
          this.refreshData();
        }
      },
      exportAllData: function() {
        if (typeof window.exportAllData === 'function') window.exportAllData();
      },
      importAllData: function() {
        if (typeof window.importAllData === 'function') window.importAllData();
      },
      onClickOverlay: function(e) {
        if (e.target === e.currentTarget) this.close();
      }
    }
  };
})();