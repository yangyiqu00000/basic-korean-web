;(function() {
  'use strict';
  if (typeof Vue === 'undefined') return;
  window.BkTipBannerComponent = {
    template: '#bk-tip-banner-template',
    props: {
      type: { type: String, default: 'info' },
      dismissable: { type: Boolean, default: false },
      tipId: { type: String, default: '' }
    },
    data: function() {
      return {
        visible: true
      };
    },
    methods: {
      dismiss: function() {
        this.visible = false;
        if (this.tipId) {
          var dismissed = JSON.parse(localStorage.getItem('korean_dismissed_tips') || '[]');
          if (dismissed.indexOf(this.tipId) === -1) {
            dismissed.push(this.tipId);
            localStorage.setItem('korean_dismissed_tips', JSON.stringify(dismissed));
          }
        }
      }
    }
  };
})();
