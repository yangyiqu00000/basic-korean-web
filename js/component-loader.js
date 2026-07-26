// js/component-loader.js — 组件懒加载系统
// 按需加载 Vue 组件 JS，减少首屏加载体积
;(function() {
  'use strict';

  var loaded = {};
  var pending = {};

  window.loadComponent = function(name) {
    return new Promise(function(resolve, reject) {
      // 已加载
      if (loaded[name]) {
        resolve(window[name + 'Component']);
        return;
      }
      // 加载中，排队
      if (pending[name]) {
        pending[name].push(resolve);
        return;
      }
      pending[name] = [resolve];

      var script = document.createElement('script');
      script.src = 'js/components/' + name + '.js';
      script.onload = function() {
        loaded[name] = true;
        var cbs = pending[name];
        delete pending[name];
        cbs.forEach(function(fn) { fn(window[name + 'Component']); });
        // 注册到 Vue 应用
        if (window.vueApp && window[name + 'Component']) {
          var kebab = name.replace(/([A-Z])/g, '-$1').toLowerCase().replace(/^-/, '');
          window.vueApp.component(kebab, window[name + 'Component']);
        }
      };
      script.onerror = function() {
        delete pending[name];
        reject(new Error('Failed to load component: ' + name));
      };
      document.body.appendChild(script);
    });
  };

  // 预加载关键组件（首页 + Design System 已经加载，这里只做标记）
  window.markComponentLoaded = function(name) {
    loaded[name] = true;
  };

  console.log('Component loader ready');
})();