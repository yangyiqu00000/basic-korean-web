// js/components/TrainingPage.js — 断句训练页面
;(function() {
  'use strict';
  if (typeof Vue === 'undefined') return;

  window.TrainingPageComponent = {
    template: '#training-page-template',
    data: function() {
      return {
        sentences: window.SENTENCES || [],
        trainingDone: JSON.parse(localStorage.getItem('korean_training_done') || '{}')
      };
    },
    computed: {
      sortedSentences: function() {
        var self = this;
        return this.sentences.slice().sort(function(a, b) {
          var aDone = self.trainingDone[a.id] ? 1 : 0;
          var bDone = self.trainingDone[b.id] ? 1 : 0;
          return aDone - bDone;
        });
      },
      doneCount: function() {
        var self = this;
        return Object.values(this.trainingDone).filter(function(v) { return v; }).length;
      },
      allDone: function() {
        return this.doneCount === this.sentences.length && this.sentences.length > 0;
      }
    },
    methods: {
      toggleDone: function(id) {
        this.trainingDone[id] = !this.trainingDone[id];
        localStorage.setItem('korean_training_done', JSON.stringify(this.trainingDone));
      }
    }
  };
})();