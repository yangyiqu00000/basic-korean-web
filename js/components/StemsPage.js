// js/components/StemsPage.js — 词干页（剥茧）
;(function() {
  'use strict';
  if (typeof Vue === 'undefined') return;

  window.StemsPageComponent = {
    template: '#stems-page-template',
    data: function() {
      return {
        stems: window.STEMS || { verbs: [] },
        isPlaying: false
      };
    },
    computed: {
      allStems: function() {
        return this.stems.verbs || [];
      }
    },
    methods: {
      getElemClass: function() {
        return 'elem-stem';
      },
      speak: function(text) {
        if (typeof window.speakKorean === 'function') {
          window.speakKorean(text);
        }
      },
      playAll: function() {
        var self = this;
        this.isPlaying = true;
        var idx = 0;
        function playNext() {
          if (idx >= self.allStems.length) {
            self.isPlaying = false;
            return;
          }
          var s = self.allStems[idx];
          var text = s.stem + '. ' + s.example;
          self.speak(text);
          idx++;
          window.stemPlayTimer = setTimeout(playNext, Math.max(2500, text.length * 200));
        }
        playNext();
      },
      stopPlay: function() {
        this.isPlaying = false;
        if (window.stemPlayTimer) {
          clearTimeout(window.stemPlayTimer);
          window.stemPlayTimer = null;
        }
      }
    },
    beforeUnmount: function() {
      this.stopPlay();
    }
  };
})();