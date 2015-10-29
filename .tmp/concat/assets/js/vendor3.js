angular.module('snap', []);

(function() {
  'use strict';
  var version = [1, 8, 4]
    , vObj = {
        full: version.join('.'),
        major: version[0],
        minor: version[1],
        patch: version[2]
      };
  angular.module('snap').constant('SNAP_VERSION', vObj);
}());

angular.module('snap')
  .directive('snapClose', ['$rootScope', 'snapRemote', function($rootScope, snapRemote) {
    'use strict';
    return {
      restrict: 'A',
      link: function (scope, element, attrs) {
        element.bind('click', function() {
          // Wrap in anonymous function for easier testing
          snapRemote.close(scope.$eval(attrs.snapId));
          $rootScope.$digest();
        });
      }
    };
  }]);

angular.module('snap')
  .directive('snapContent', ['SnapConstructor', 'snapRemote', function (SnapConstructor, snapRemote) {
    'use strict';
    return {
      restrict: 'AE',
      link: function postLink(scope, element, attrs) {
        element.addClass('snap-content');

        var snapId = attrs.snapId;
        if(!!snapId) {
          snapId = scope.$eval(attrs.snapId);
        }

        var snapOptions = angular.extend({}, snapRemote.globalOptions);

        var watchAttr = function(val, attr) {
          scope.$watch(function() {
            return scope.$eval(val);
          }, function(newVal, oldVal) {
            if(angular.isDefined(oldVal) && newVal !== oldVal) {
              snapRemote.getSnapper(snapId).then(function(snapper) {
                var settingsUpdate = {};
                settingsUpdate[attr] = newVal;
                snapper.settings(settingsUpdate);
              });
            }
          });
        };

        // Get `snapOpt*` attrs, for now there is no *binding* going on here.
        // We're just providing a more declarative way to set initial values.
        angular.forEach(attrs, function(val, attr) {
          if(attr.indexOf('snapOpt') === 0) {
            attr = attr.substring(7);
            if(attr.length) {
              attr = attr[0].toLowerCase() + attr.substring(1);
              snapOptions[attr] = scope.$eval(val);
              watchAttr(val, attr);
            }
          }
        });

        // Always force the snap element to be the one this directive is
        // attached to.
        snapOptions.element = element[0];

        // override snap options if some provided in snap-options attribute
        if(angular.isDefined(attrs.snapOptions) && attrs.snapOptions) {
          angular.extend(snapOptions, scope.$eval(attrs.snapOptions));
        }

        snapRemote.register(new SnapConstructor(snapOptions), snapId);

        // watch snapOptions for updates
        if(angular.isDefined(attrs.snapOptions) && attrs.snapOptions) {
          scope.$watch(attrs.snapOptions, function(newSnapOptions) {
            snapRemote.getSnapper(snapId).then(function(snapper) {
              snapper.settings(newSnapOptions);
            });
          }, true);
        }

        scope.$on('$destroy', function() {
          snapRemote.unregister(snapId);
        });
      }
    };
  }]);

angular.module('snap')
  .directive('snapDragger', ['snapRemote', function(snapRemote) {
    'use strict';
    return {
      restrict: 'AE',
      link: function(scope, element, attrs) {
        var snapId = scope.$eval(attrs.snapId);
        snapRemote.getSnapper(snapId).then(function(snapper) {
          snapper.settings({
            dragger: element[0]
          });
        });
      }
    };
  }]);


angular.module('snap')
  .directive('snapDrawer', function () {
    'use strict';
    return {
      restrict: 'AE',
      link: function(scope, element, attrs) {
        element.addClass('snap-drawer');

        // Don't force a `snap-drawers` wrapper when we only want to use a
        // single shelf
        var parent = element.parent()
          , needsDrawersWrapper = true;

        if (attrs.snapDrawer === 'right') {
          element.addClass('snap-drawer-right');
        } else {
          element.addClass('snap-drawer-left');
        }

        while(parent.length) {
          if(parent.hasClass('snap-drawers')) {
            needsDrawersWrapper = false;
          }
          parent = parent.parent();
        }

        if(needsDrawersWrapper) {
          element.wrap('<div class="snap-drawers" />');
        }

      }
    };
  });

angular.module('snap')
  .directive('snapDrawers', function () {
    'use strict';
    return {
      restrict: 'AE',
      compile: function(element, attrs) {
        element.addClass('snap-drawers');
      }
    };
  });


angular.module('snap')
  .directive('snapToggle', ['$rootScope', 'snapRemote', function($rootScope, snapRemote) {
      'use strict';
      return {
        restrict: 'A',
        link: function (scope, element, attrs) {
          var snapId = attrs.snapId
            , snapSide = attrs.snapToggle || 'left';

          if(!!snapId) {
            snapId = scope.$eval(snapId);
          }

          /**
           * Stifle mousedown and mouseup events by default
           *
           * See issue #61
           *
           * mousedown can create a race condition with the Snap.js `tapToClose`
           * setting, the `tapToClose` handler runs first (if drawer is open)
           * then our toggle handler runs. Depending on how far along in the
           * close animation the drawer is when the toggle handler runs we may
           * end up keeping the drawer open (i.e. a quick open/close) or *only*
           * performing a double close.
           *
           * The situation is trickier because we want to allow mouseup events
           * to flow through **if** the corresponding mousedown event did not
           * target out toggle button... otherwise you could get stuck in a
           * drag. We have a naive approach to preventing this... you can still
           * get stuck in drag temporarily if you: mouse down on the toggle
           * button, then mouse up off screen, then start a drag, then mouse
           * down on the toggle button.
           */
          if(!attrs.snapUnsafe) {
            var downOnMe = false;
            element.bind('mousedown', function(event) {
              downOnMe = true;
              event.stopImmediatePropagation();
            });

            element.bind('mouseup', function(event) {
              if(downOnMe) {
                event.stopImmediatePropagation();
              }
              downOnMe = false;
            });
          }

          element.bind('click', function() {
            snapRemote.toggle(snapSide, snapId);
            $rootScope.$digest();
          });
        }
      };
  }]);

angular.module('snap')
.provider('SnapConstructor', function() {
  'use strict';
  var constructor = window.Snap;

  this.use = function(Snap) {
    constructor = Snap;
  };

  this.$get = function() {
    return constructor;
  };
});


angular.module('snap')
.provider('snapRemote', function SnapRemoteProvider() {
  'use strict';

  // Global Snap.js options
  var self = this;
  this.globalOptions = {};

  this.$get = ['$q', function($q) {

    var snapperStore = {}
      , DEFAULT_SNAPPER_ID = '__DEFAULT_SNAPPER_ID__'
      , exports = {}
      , initStoreForId
      , resolveInStoreById;

    exports.globalOptions = self.globalOptions;

    exports.getSnapper = function(id) {
      id = id || DEFAULT_SNAPPER_ID;
      if(!snapperStore.hasOwnProperty(id)) {
        initStoreForId(id);
      }
      return snapperStore[id].deferred.promise;
    };

    exports.register = function(snapper, id) {
      id = id || DEFAULT_SNAPPER_ID;
      if(!snapperStore.hasOwnProperty(id)) {
        initStoreForId(id);
      }
      if(snapperStore[id].isResolved) {
        initStoreForId(id);
      }
      resolveInStoreById(snapper, id);
    };

    exports.unregister = function(id) {
      id = id || DEFAULT_SNAPPER_ID;
      if(snapperStore.hasOwnProperty(id)) {
        delete snapperStore[id];
      }
    };

    exports.toggle = function(side, id) {
      id = id || DEFAULT_SNAPPER_ID;
      exports.getSnapper(id).then(function(snapper) {
        if(side === snapper.state().state) {
          exports.close(id);
        } else {
          exports.open(side, id);
        }
      });
    };

    exports.open = function(side, id) {
      id = id || DEFAULT_SNAPPER_ID;
      exports.getSnapper(id).then(function(snapper) {
        snapper.open(side);
      });
    };

    exports.close = function(id) {
      id = id || DEFAULT_SNAPPER_ID;
      exports.getSnapper(id).then(function(snapper) {
        snapper.close();
      });
    };

    exports.expand = function(side, id) {
      id = id || DEFAULT_SNAPPER_ID;
      exports.getSnapper(id).then(function(snapper) {
        snapper.expand(side);
      });
    };

    exports.enable = function(id) {
      id = id || DEFAULT_SNAPPER_ID;
      exports.getSnapper(id).then(function(snapper) {
        snapper.enable();
      });
    };

    exports.disable = function(id) {
      id = id || DEFAULT_SNAPPER_ID;
      exports.getSnapper(id).then(function(snapper) {
        snapper.disable();
      });
    };

    initStoreForId = function(id) {
      snapperStore[id] = {
        deferred: $q.defer(),
        isResolved: false
      };
    };

    resolveInStoreById = function(snapper, id) {
      snapperStore[id].deferred.resolve(snapper);
      snapperStore[id].isResolved = true;
    };

    return exports;
  }];

  return this;
});


/*!
 * angular-translate - v2.8.1 - 2015-10-01
 * 
 * Copyright (c) 2015 The angular-translate team, Pascal Precht; Licensed MIT
 */
!function(a,b){"function"==typeof define&&define.amd?define([],function(){return b()}):"object"==typeof exports?module.exports=b():b()}(this,function(){function a(a){"use strict";var b=a.storageKey(),c=a.storage(),d=function(){var d=a.preferredLanguage();angular.isString(d)?a.use(d):c.put(b,a.use())};d.displayName="fallbackFromIncorrectStorageValue",c?c.get(b)?a.use(c.get(b))["catch"](d):d():angular.isString(a.preferredLanguage())&&a.use(a.preferredLanguage())}function b(){"use strict";var a,b,c=null,d=!1,e=!1;b={sanitize:function(a,b){return"text"===b&&(a=g(a)),a},escape:function(a,b){return"text"===b&&(a=f(a)),a},sanitizeParameters:function(a,b){return"params"===b&&(a=h(a,g)),a},escapeParameters:function(a,b){return"params"===b&&(a=h(a,f)),a}},b.escaped=b.escapeParameters,this.addStrategy=function(a,c){return b[a]=c,this},this.removeStrategy=function(a){return delete b[a],this},this.useStrategy=function(a){return d=!0,c=a,this},this.$get=["$injector","$log",function(f,g){var h={},i=function(a,c,d){return angular.forEach(d,function(d){if(angular.isFunction(d))a=d(a,c);else if(angular.isFunction(b[d]))a=b[d](a,c);else{if(!angular.isString(b[d]))throw new Error("pascalprecht.translate.$translateSanitization: Unknown sanitization strategy: '"+d+"'");if(!h[b[d]])try{h[b[d]]=f.get(b[d])}catch(e){throw h[b[d]]=function(){},new Error("pascalprecht.translate.$translateSanitization: Unknown sanitization strategy: '"+d+"'")}a=h[b[d]](a,c)}}),a},j=function(){d||e||(g.warn("pascalprecht.translate.$translateSanitization: No sanitization strategy has been configured. This can have serious security implications. See http://angular-translate.github.io/docs/#/guide/19_security for details."),e=!0)};return f.has("$sanitize")&&(a=f.get("$sanitize")),{useStrategy:function(a){return function(b){a.useStrategy(b)}}(this),sanitize:function(a,b,d){if(c||j(),arguments.length<3&&(d=c),!d)return a;var e=angular.isArray(d)?d:[d];return i(a,b,e)}}}];var f=function(a){var b=angular.element("<div></div>");return b.text(a),b.html()},g=function(b){if(!a)throw new Error("pascalprecht.translate.$translateSanitization: Error cannot find $sanitize service. Either include the ngSanitize module (https://docs.angularjs.org/api/ngSanitize) or use a sanitization strategy which does not depend on $sanitize, such as 'escape'.");return a(b)},h=function(a,b){if(angular.isObject(a)){var c=angular.isArray(a)?[]:{};return angular.forEach(a,function(a,d){c[d]=h(a,b)}),c}return angular.isNumber(a)?a:b(a)}}function c(a,b,c,d){"use strict";var e,f,g,h,i,j,k,l,m,n,o,p,q,r,s,t={},u=[],v=a,w=[],x="translate-cloak",y=!1,z=!1,A=".",B=!1,C=0,D=!0,E="default",F={"default":function(a){return(a||"").split("-").join("_")},java:function(a){var b=(a||"").split("-").join("_"),c=b.split("_");return c.length>1?c[0].toLowerCase()+"_"+c[1].toUpperCase():b},bcp47:function(a){var b=(a||"").split("_").join("-"),c=b.split("-");return c.length>1?c[0].toLowerCase()+"-"+c[1].toUpperCase():b}},G="2.8.1",H=function(){if(angular.isFunction(d.getLocale))return d.getLocale();var a,c,e=b.$get().navigator,f=["language","browserLanguage","systemLanguage","userLanguage"];if(angular.isArray(e.languages))for(a=0;a<e.languages.length;a++)if(c=e.languages[a],c&&c.length)return c;for(a=0;a<f.length;a++)if(c=e[f[a]],c&&c.length)return c;return null};H.displayName="angular-translate/service: getFirstBrowserLanguage";var I=function(){var a=H()||"";return F[E]&&(a=F[E](a)),a};I.displayName="angular-translate/service: getLocale";var J=function(a,b){for(var c=0,d=a.length;d>c;c++)if(a[c]===b)return c;return-1},K=function(){return this.toString().replace(/^\s+|\s+$/g,"")},L=function(a){for(var b=[],c=angular.lowercase(a),d=0,e=u.length;e>d;d++)b.push(angular.lowercase(u[d]));if(J(b,c)>-1)return a;if(f){var g;for(var h in f){var i=!1,j=Object.prototype.hasOwnProperty.call(f,h)&&angular.lowercase(h)===angular.lowercase(a);if("*"===h.slice(-1)&&(i=h.slice(0,-1)===a.slice(0,h.length-1)),(j||i)&&(g=f[h],J(b,angular.lowercase(g))>-1))return g}}if(a){var k=a.split("_");if(k.length>1&&J(b,angular.lowercase(k[0]))>-1)return k[0]}return a},M=function(a,b){if(!a&&!b)return t;if(a&&!b){if(angular.isString(a))return t[a]}else angular.isObject(t[a])||(t[a]={}),angular.extend(t[a],N(b));return this};this.translations=M,this.cloakClassName=function(a){return a?(x=a,this):x},this.nestedObjectDelimeter=function(a){return a?(A=a,this):A};var N=function(a,b,c,d){var e,f,g,h;b||(b=[]),c||(c={});for(e in a)Object.prototype.hasOwnProperty.call(a,e)&&(h=a[e],angular.isObject(h)?N(h,b.concat(e),c,e):(f=b.length?""+b.join(A)+A+e:e,b.length&&e===d&&(g=""+b.join(A),c[g]="@:"+f),c[f]=h));return c};N.displayName="flatObject",this.addInterpolation=function(a){return w.push(a),this},this.useMessageFormatInterpolation=function(){return this.useInterpolation("$translateMessageFormatInterpolation")},this.useInterpolation=function(a){return n=a,this},this.useSanitizeValueStrategy=function(a){return c.useStrategy(a),this},this.preferredLanguage=function(a){return a?(O(a),this):e};var O=function(a){return a&&(e=a),e};this.translationNotFoundIndicator=function(a){return this.translationNotFoundIndicatorLeft(a),this.translationNotFoundIndicatorRight(a),this},this.translationNotFoundIndicatorLeft=function(a){return a?(q=a,this):q},this.translationNotFoundIndicatorRight=function(a){return a?(r=a,this):r},this.fallbackLanguage=function(a){return P(a),this};var P=function(a){return a?(angular.isString(a)?(h=!0,g=[a]):angular.isArray(a)&&(h=!1,g=a),angular.isString(e)&&J(g,e)<0&&g.push(e),this):h?g[0]:g};this.use=function(a){if(a){if(!t[a]&&!o)throw new Error("$translateProvider couldn't find translationTable for langKey: '"+a+"'");return i=a,this}return i};var Q=function(a){return a?(v=a,this):l?l+v:v};this.storageKey=Q,this.useUrlLoader=function(a,b){return this.useLoader("$translateUrlLoader",angular.extend({url:a},b))},this.useStaticFilesLoader=function(a){return this.useLoader("$translateStaticFilesLoader",a)},this.useLoader=function(a,b){return o=a,p=b||{},this},this.useLocalStorage=function(){return this.useStorage("$translateLocalStorage")},this.useCookieStorage=function(){return this.useStorage("$translateCookieStorage")},this.useStorage=function(a){return k=a,this},this.storagePrefix=function(a){return a?(l=a,this):a},this.useMissingTranslationHandlerLog=function(){return this.useMissingTranslationHandler("$translateMissingTranslationHandlerLog")},this.useMissingTranslationHandler=function(a){return m=a,this},this.usePostCompiling=function(a){return y=!!a,this},this.forceAsyncReload=function(a){return z=!!a,this},this.uniformLanguageTag=function(a){return a?angular.isString(a)&&(a={standard:a}):a={},E=a.standard,this},this.determinePreferredLanguage=function(a){var b=a&&angular.isFunction(a)?a():I();return e=u.length?L(b):b,this},this.registerAvailableLanguageKeys=function(a,b){return a?(u=a,b&&(f=b),this):u},this.useLoaderCache=function(a){return a===!1?s=void 0:a===!0?s=!0:"undefined"==typeof a?s="$translationCache":a&&(s=a),this},this.directivePriority=function(a){return void 0===a?C:(C=a,this)},this.statefulFilter=function(a){return void 0===a?D:(D=a,this)},this.$get=["$log","$injector","$rootScope","$q",function(a,b,c,d){var f,l,u,E=b.get(n||"$translateDefaultInterpolation"),F=!1,H={},I={},R=function(a,b,c,h){if(angular.isArray(a)){var j=function(a){for(var e={},f=[],g=function(a){var f=d.defer(),g=function(b){e[a]=b,f.resolve([a,b])};return R(a,b,c,h).then(g,g),f.promise},i=0,j=a.length;j>i;i++)f.push(g(a[i]));return d.all(f).then(function(){return e})};return j(a)}var m=d.defer();a&&(a=K.apply(a));var n=function(){var a=e?I[e]:I[i];if(l=0,k&&!a){var b=f.get(v);if(a=I[b],g&&g.length){var c=J(g,b);l=0===c?1:0,J(g,e)<0&&g.push(e)}}return a}();if(n){var o=function(){ca(a,b,c,h).then(m.resolve,m.reject)};o.displayName="promiseResolved",n["finally"](o,m.reject)}else ca(a,b,c,h).then(m.resolve,m.reject);return m.promise},S=function(a){return q&&(a=[q,a].join(" ")),r&&(a=[a,r].join(" ")),a},T=function(a){i=a,k&&f.put(R.storageKey(),i),c.$emit("$translateChangeSuccess",{language:a}),E.setLocale(i);var b=function(a,b){H[b].setLocale(i)};b.displayName="eachInterpolatorLocaleSetter",angular.forEach(H,b),c.$emit("$translateChangeEnd",{language:a})},U=function(a){if(!a)throw"No language key specified for loading.";var e=d.defer();c.$emit("$translateLoadingStart",{language:a}),F=!0;var f=s;"string"==typeof f&&(f=b.get(f));var g=angular.extend({},p,{key:a,$http:angular.extend({},{cache:f},p.$http)}),h=function(b){var d={};c.$emit("$translateLoadingSuccess",{language:a}),angular.isArray(b)?angular.forEach(b,function(a){angular.extend(d,N(a))}):angular.extend(d,N(b)),F=!1,e.resolve({key:a,table:d}),c.$emit("$translateLoadingEnd",{language:a})};h.displayName="onLoaderSuccess";var i=function(a){c.$emit("$translateLoadingError",{language:a}),e.reject(a),c.$emit("$translateLoadingEnd",{language:a})};return i.displayName="onLoaderError",b.get(o)(g).then(h,i),e.promise};if(k&&(f=b.get(k),!f.get||!f.put))throw new Error("Couldn't use storage '"+k+"', missing get() or put() method!");if(w.length){var V=function(a){var c=b.get(a);c.setLocale(e||i),H[c.getInterpolationIdentifier()]=c};V.displayName="interpolationFactoryAdder",angular.forEach(w,V)}var W=function(a){var b=d.defer();if(Object.prototype.hasOwnProperty.call(t,a))b.resolve(t[a]);else if(I[a]){var c=function(a){M(a.key,a.table),b.resolve(a.table)};c.displayName="translationTableResolver",I[a].then(c,b.reject)}else b.reject();return b.promise},X=function(a,b,c,e){var f=d.defer(),g=function(d){if(Object.prototype.hasOwnProperty.call(d,b)){e.setLocale(a);var g=d[b];"@:"===g.substr(0,2)?X(a,g.substr(2),c,e).then(f.resolve,f.reject):f.resolve(e.interpolate(d[b],c)),e.setLocale(i)}else f.reject()};return g.displayName="fallbackTranslationResolver",W(a).then(g,f.reject),f.promise},Y=function(a,b,c,d){var e,f=t[a];if(f&&Object.prototype.hasOwnProperty.call(f,b)){if(d.setLocale(a),e=d.interpolate(f[b],c),"@:"===e.substr(0,2))return Y(a,e.substr(2),c,d);d.setLocale(i)}return e},Z=function(a,c){if(m){var d=b.get(m)(a,i,c);return void 0!==d?d:a}return a},$=function(a,b,c,e,f){var h=d.defer();if(a<g.length){var i=g[a];X(i,b,c,e).then(h.resolve,function(){$(a+1,b,c,e,f).then(h.resolve)})}else f?h.resolve(f):h.resolve(Z(b,c));return h.promise},_=function(a,b,c,d){var e;if(a<g.length){var f=g[a];e=Y(f,b,c,d),e||(e=_(a+1,b,c,d))}return e},aa=function(a,b,c,d){return $(u>0?u:l,a,b,c,d)},ba=function(a,b,c){return _(u>0?u:l,a,b,c)},ca=function(a,b,c,e){var f=d.defer(),h=i?t[i]:t,j=c?H[c]:E;if(h&&Object.prototype.hasOwnProperty.call(h,a)){var k=h[a];"@:"===k.substr(0,2)?R(k.substr(2),b,c,e).then(f.resolve,f.reject):f.resolve(j.interpolate(k,b))}else{var l;m&&!F&&(l=Z(a,b)),i&&g&&g.length?aa(a,b,j,e).then(function(a){f.resolve(a)},function(a){f.reject(S(a))}):m&&!F&&l?e?f.resolve(e):f.resolve(l):e?f.resolve(e):f.reject(S(a))}return f.promise},da=function(a,b,c){var d,e=i?t[i]:t,f=E;if(H&&Object.prototype.hasOwnProperty.call(H,c)&&(f=H[c]),e&&Object.prototype.hasOwnProperty.call(e,a)){var h=e[a];d="@:"===h.substr(0,2)?da(h.substr(2),b,c):f.interpolate(h,b)}else{var j;m&&!F&&(j=Z(a,b)),i&&g&&g.length?(l=0,d=ba(a,b,f)):d=m&&!F&&j?j:S(a)}return d},ea=function(a){j===a&&(j=void 0),I[a]=void 0};R.preferredLanguage=function(a){return a&&O(a),e},R.cloakClassName=function(){return x},R.nestedObjectDelimeter=function(){return A},R.fallbackLanguage=function(a){if(void 0!==a&&null!==a){if(P(a),o&&g&&g.length)for(var b=0,c=g.length;c>b;b++)I[g[b]]||(I[g[b]]=U(g[b]));R.use(R.use())}return h?g[0]:g},R.useFallbackLanguage=function(a){if(void 0!==a&&null!==a)if(a){var b=J(g,a);b>-1&&(u=b)}else u=0},R.proposedLanguage=function(){return j},R.storage=function(){return f},R.use=function(a){if(!a)return i;var b=d.defer();c.$emit("$translateChangeStart",{language:a});var e=L(a);return e&&(a=e),!z&&t[a]||!o||I[a]?j===a&&I[a]?I[a].then(function(a){return b.resolve(a.key),a},function(a){return b.reject(a),d.reject(a)}):(b.resolve(a),T(a)):(j=a,I[a]=U(a).then(function(c){return M(c.key,c.table),b.resolve(c.key),j===a&&T(c.key),c},function(a){return c.$emit("$translateChangeError",{language:a}),b.reject(a),c.$emit("$translateChangeEnd",{language:a}),d.reject(a)}),I[a]["finally"](function(){ea(a)})),b.promise},R.storageKey=function(){return Q()},R.isPostCompilingEnabled=function(){return y},R.isForceAsyncReloadEnabled=function(){return z},R.refresh=function(a){function b(){f.resolve(),c.$emit("$translateRefreshEnd",{language:a})}function e(){f.reject(),c.$emit("$translateRefreshEnd",{language:a})}if(!o)throw new Error("Couldn't refresh translation table, no loader registered!");var f=d.defer();if(c.$emit("$translateRefreshStart",{language:a}),a)if(t[a]){var h=function(c){M(c.key,c.table),a===i&&T(i),b()};h.displayName="refreshPostProcessor",U(a).then(h,e)}else e();else{var j=[],k={};if(g&&g.length)for(var l=0,m=g.length;m>l;l++)j.push(U(g[l])),k[g[l]]=!0;i&&!k[i]&&j.push(U(i));var n=function(a){t={},angular.forEach(a,function(a){M(a.key,a.table)}),i&&T(i),b()};n.displayName="refreshPostProcessor",d.all(j).then(n,e)}return f.promise},R.instant=function(a,b,c){if(null===a||angular.isUndefined(a))return a;if(angular.isArray(a)){for(var d={},f=0,h=a.length;h>f;f++)d[a[f]]=R.instant(a[f],b,c);return d}if(angular.isString(a)&&a.length<1)return a;a&&(a=K.apply(a));var j,k=[];e&&k.push(e),i&&k.push(i),g&&g.length&&(k=k.concat(g));for(var l=0,n=k.length;n>l;l++){var o=k[l];if(t[o]&&("undefined"!=typeof t[o][a]?j=da(a,b,c):(q||r)&&(j=S(a))),"undefined"!=typeof j)break}return j||""===j||(j=E.interpolate(a,b),m&&!F&&(j=Z(a,b))),j},R.versionInfo=function(){return G},R.loaderCache=function(){return s},R.directivePriority=function(){return C},R.statefulFilter=function(){return D},R.isReady=function(){return B};var fa=d.defer();fa.promise.then(function(){B=!0}),R.onReady=function(a){var b=d.defer();return angular.isFunction(a)&&b.promise.then(a),B?b.resolve():fa.promise.then(b.resolve),b.promise};var ga=c.$on("$translateReady",function(){fa.resolve(),ga(),ga=null}),ha=c.$on("$translateChangeEnd",function(){fa.resolve(),ha(),ha=null});if(o){if(angular.equals(t,{})&&R.use()&&R.use(R.use()),g&&g.length)for(var ia=function(a){return M(a.key,a.table),c.$emit("$translateChangeEnd",{language:a.key}),a},ja=0,ka=g.length;ka>ja;ja++){var la=g[ja];(z||!t[la])&&(I[la]=U(la).then(ia))}}else c.$emit("$translateReady",{language:R.use()});return R}]}function d(a,b){"use strict";var c,d={},e="default";return d.setLocale=function(a){c=a},d.getInterpolationIdentifier=function(){return e},d.useSanitizeValueStrategy=function(a){return b.useStrategy(a),this},d.interpolate=function(c,d){d=d||{},d=b.sanitize(d,"params");var e=a(c)(d);return e=b.sanitize(e,"text")},d}function e(a,b,c,d,e,g){"use strict";var h=function(){return this.toString().replace(/^\s+|\s+$/g,"")};return{restrict:"AE",scope:!0,priority:a.directivePriority(),compile:function(b,i){var j=i.translateValues?i.translateValues:void 0,k=i.translateInterpolation?i.translateInterpolation:void 0,l=b[0].outerHTML.match(/translate-value-+/i),m="^(.*)("+c.startSymbol()+".*"+c.endSymbol()+")(.*)",n="^(.*)"+c.startSymbol()+"(.*)"+c.endSymbol()+"(.*)";return function(b,o,p){b.interpolateParams={},b.preText="",b.postText="",b.translateNamespace=f(b);var q={},r=function(a,c,d){if(c.translateValues&&angular.extend(a,e(c.translateValues)(b.$parent)),l)for(var f in d)if(Object.prototype.hasOwnProperty.call(c,f)&&"translateValue"===f.substr(0,14)&&"translateValues"!==f){var g=angular.lowercase(f.substr(14,1))+f.substr(15);a[g]=d[f]}},s=function(a){if(angular.isFunction(s._unwatchOld)&&(s._unwatchOld(),s._unwatchOld=void 0),angular.equals(a,"")||!angular.isDefined(a)){var d=h.apply(o.text()),e=d.match(m);if(angular.isArray(e)){b.preText=e[1],b.postText=e[3],q.translate=c(e[2])(b.$parent);var f=d.match(n);angular.isArray(f)&&f[2]&&f[2].length&&(s._unwatchOld=b.$watch(f[2],function(a){q.translate=a,y()}))}else q.translate=d}else q.translate=a;y()},t=function(a){p.$observe(a,function(b){q[a]=b,y()})};r(b.interpolateParams,p,i);var u=!0;p.$observe("translate",function(a){"undefined"==typeof a?s(""):""===a&&u||(q.translate=a,y()),u=!1});for(var v in p)p.hasOwnProperty(v)&&"translateAttr"===v.substr(0,13)&&t(v);if(p.$observe("translateDefault",function(a){b.defaultText=a}),j&&p.$observe("translateValues",function(a){a&&b.$parent.$watch(function(){angular.extend(b.interpolateParams,e(a)(b.$parent))})}),l){var w=function(a){p.$observe(a,function(c){var d=angular.lowercase(a.substr(14,1))+a.substr(15);b.interpolateParams[d]=c})};for(var x in p)Object.prototype.hasOwnProperty.call(p,x)&&"translateValue"===x.substr(0,14)&&"translateValues"!==x&&w(x)}var y=function(){for(var a in q)q.hasOwnProperty(a)&&void 0!==q[a]&&z(a,q[a],b,b.interpolateParams,b.defaultText,b.translateNamespace)},z=function(b,c,d,e,f,g){c?(g&&"."===c.charAt(0)&&(c=g+c),a(c,e,k,f).then(function(a){A(a,d,!0,b)},function(a){A(a,d,!1,b)})):A(c,d,!1,b)},A=function(b,c,e,f){if("translate"===f){e||"undefined"==typeof c.defaultText||(b=c.defaultText),o.empty().append(c.preText+b+c.postText);var g=a.isPostCompilingEnabled(),h="undefined"!=typeof i.translateCompile,j=h&&"false"!==i.translateCompile;(g&&!h||j)&&d(o.contents())(c)}else{e||"undefined"==typeof c.defaultText||(b=c.defaultText);var k=p.$attr[f];"data-"===k.substr(0,5)&&(k=k.substr(5)),k=k.substr(15),o.attr(k,b)}};(j||l||p.translateDefault)&&b.$watch("interpolateParams",y,!0);var B=g.$on("$translateChangeSuccess",y);o.text().length?s(p.translate?p.translate:""):p.translate&&s(p.translate),y(),b.$on("$destroy",B)}}}}function f(a){"use strict";return a.translateNamespace?a.translateNamespace:a.$parent?f(a.$parent):void 0}function g(a){"use strict";return{compile:function(b){var c=function(){b.addClass(a.cloakClassName())},d=function(){b.removeClass(a.cloakClassName())};return a.onReady(function(){d()}),c(),function(b,e,f){f.translateCloak&&f.translateCloak.length&&f.$observe("translateCloak",function(b){a(b).then(d,c)})}}}}function h(){"use strict";return{restrict:"A",scope:!0,compile:function(){return{pre:function(a,b,c){a.translateNamespace=f(a),a.translateNamespace&&"."===c.translateNamespace.charAt(0)?a.translateNamespace+=c.translateNamespace:a.translateNamespace=c.translateNamespace}}}}}function f(a){"use strict";return a.translateNamespace?a.translateNamespace:a.$parent?f(a.$parent):void 0}function i(a,b){"use strict";var c=function(c,d,e){return angular.isObject(d)||(d=a(d)(this)),b.instant(c,d,e)};return b.statefulFilter()&&(c.$stateful=!0),c}function j(a){"use strict";return a("translations")}return angular.module("pascalprecht.translate",["ng"]).run(a),a.$inject=["$translate"],a.displayName="runTranslate",angular.module("pascalprecht.translate").provider("$translateSanitization",b),angular.module("pascalprecht.translate").constant("pascalprechtTranslateOverrider",{}).provider("$translate",c),c.$inject=["$STORAGE_KEY","$windowProvider","$translateSanitizationProvider","pascalprechtTranslateOverrider"],c.displayName="displayName",angular.module("pascalprecht.translate").factory("$translateDefaultInterpolation",d),d.$inject=["$interpolate","$translateSanitization"],d.displayName="$translateDefaultInterpolation",angular.module("pascalprecht.translate").constant("$STORAGE_KEY","NG_TRANSLATE_LANG_KEY"),angular.module("pascalprecht.translate").directive("translate",e),e.$inject=["$translate","$q","$interpolate","$compile","$parse","$rootScope"],e.displayName="translateDirective",angular.module("pascalprecht.translate").directive("translateCloak",g),g.$inject=["$translate"],g.displayName="translateCloakDirective",angular.module("pascalprecht.translate").directive("translateNamespace",h),h.displayName="translateNamespaceDirective",angular.module("pascalprecht.translate").filter("translate",i),i.$inject=["$parse","$translate"],i.displayName="translateFilterFactory",angular.module("pascalprecht.translate").factory("$translationCache",j),j.$inject=["$cacheFactory"],j.displayName="$translationCache","pascalprecht.translate"});

/*!
 * angular-translate - v2.8.1 - 2015-10-01
 * 
 * Copyright (c) 2015 The angular-translate team, Pascal Precht; Licensed MIT
 */
(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module unless amdModuleId is set
    define([], function () {
      return (factory());
    });
  } else if (typeof exports === 'object') {
    // Node. Does not work with strict CommonJS, but
    // only CommonJS-like environments that support module.exports,
    // like Node.
    module.exports = factory();
  } else {
    factory();
  }
}(this, function () {

angular.module('pascalprecht.translate')

/**
 * @ngdoc object
 * @name pascalprecht.translate.$translateLocalStorage
 * @requires $window
 * @requires $translateCookieStorage
 *
 * @description
 * Abstraction layer for localStorage. This service is used when telling angular-translate
 * to use localStorage as storage.
 *
 */
.factory('$translateLocalStorage', $translateLocalStorageFactory);

function $translateLocalStorageFactory($window, $translateCookieStorage) {

  'use strict';

  // Setup adapter
  var localStorageAdapter = (function(){
    var langKey;
    return {
      /**
       * @ngdoc function
       * @name pascalprecht.translate.$translateLocalStorage#get
       * @methodOf pascalprecht.translate.$translateLocalStorage
       *
       * @description
       * Returns an item from localStorage by given name.
       *
       * @param {string} name Item name
       * @return {string} Value of item name
       */
      get: function (name) {
        if(!langKey) {
          langKey = $window.localStorage.getItem(name);
        }

        return langKey;
      },
      /**
       * @ngdoc function
       * @name pascalprecht.translate.$translateLocalStorage#set
       * @methodOf pascalprecht.translate.$translateLocalStorage
       *
       * @description
       * Sets an item in localStorage by given name.
       *
       * @deprecated use #put
       *
       * @param {string} name Item name
       * @param {string} value Item value
       */
      set: function (name, value) {
        langKey=value;
        $window.localStorage.setItem(name, value);
      },
      /**
       * @ngdoc function
       * @name pascalprecht.translate.$translateLocalStorage#put
       * @methodOf pascalprecht.translate.$translateLocalStorage
       *
       * @description
       * Sets an item in localStorage by given name.
       *
       * @param {string} name Item name
       * @param {string} value Item value
       */
      put: function (name, value) {
        langKey=value;
        $window.localStorage.setItem(name, value);
      }
    };
  }());

  var hasLocalStorageSupport = 'localStorage' in $window;
  if (hasLocalStorageSupport) {
    var testKey = 'pascalprecht.translate.storageTest';
    try {
      // this check have to be wrapped within a try/catch because on
      // a SecurityError: Dom Exception 18 on iOS
      if ($window.localStorage !== null) {
        $window.localStorage.setItem(testKey, 'foo');
        $window.localStorage.removeItem(testKey);
        hasLocalStorageSupport = true;
      } else {
        hasLocalStorageSupport = false;
      }
    } catch (e){
      hasLocalStorageSupport = false;
    }
  }
  var $translateLocalStorage = hasLocalStorageSupport ? localStorageAdapter : $translateCookieStorage;
  return $translateLocalStorage;
}
$translateLocalStorageFactory.$inject = ['$window', '$translateCookieStorage'];

$translateLocalStorageFactory.displayName = '$translateLocalStorageFactory';
return 'pascalprecht.translate';

}));


/*!
 * angular-translate - v2.8.1 - 2015-10-01
 * 
 * Copyright (c) 2015 The angular-translate team, Pascal Precht; Licensed MIT
 */
(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module unless amdModuleId is set
    define([], function () {
      return (factory());
    });
  } else if (typeof exports === 'object') {
    // Node. Does not work with strict CommonJS, but
    // only CommonJS-like environments that support module.exports,
    // like Node.
    module.exports = factory();
  } else {
    factory();
  }
}(this, function () {

angular.module('pascalprecht.translate')
/**
 * @ngdoc object
 * @name pascalprecht.translate.$translateStaticFilesLoader
 * @requires $q
 * @requires $http
 *
 * @description
 * Creates a loading function for a typical static file url pattern:
 * "lang-en_US.json", "lang-de_DE.json", etc. Using this builder,
 * the response of these urls must be an object of key-value pairs.
 *
 * @param {object} options Options object, which gets prefix, suffix and key.
 */
.factory('$translateStaticFilesLoader', $translateStaticFilesLoader);

function $translateStaticFilesLoader($q, $http) {

  'use strict';

  return function (options) {

    if (!options || (!angular.isArray(options.files) && (!angular.isString(options.prefix) || !angular.isString(options.suffix)))) {
      throw new Error('Couldn\'t load static files, no files and prefix or suffix specified!');
    }

    if (!options.files) {
      options.files = [{
        prefix: options.prefix,
        suffix: options.suffix
      }];
    }

    var load = function (file) {
      if (!file || (!angular.isString(file.prefix) || !angular.isString(file.suffix))) {
        throw new Error('Couldn\'t load static file, no prefix or suffix specified!');
      }

      return $http(angular.extend({
        url: [
          file.prefix,
          options.key,
          file.suffix
        ].join(''),
        method: 'GET',
        params: ''
      }, options.$http))
        .then(function(result) {
          return result.data;
        }, function () {
          return $q.reject(options.key);
        });
    };

    var deferred = $q.defer(),
        promises = [],
        length = options.files.length;

    for (var i = 0; i < length; i++) {
      promises.push(load({
        prefix: options.files[i].prefix,
        key: options.key,
        suffix: options.files[i].suffix
      }));
    }

    $q.all(promises)
      .then(function (data) {
        var length = data.length,
            mergedData = {};

        for (var i = 0; i < length; i++) {
          for (var key in data[i]) {
            mergedData[key] = data[i][key];
          }
        }

        deferred.resolve(mergedData);
      }, function (data) {
        deferred.reject(data);
      });

    return deferred.promise;
  };
}
$translateStaticFilesLoader.$inject = ['$q', '$http'];

$translateStaticFilesLoader.displayName = '$translateStaticFilesLoader';
return 'pascalprecht.translate';

}));


/*!
 * angular-translate - v2.8.1 - 2015-10-01
 * 
 * Copyright (c) 2015 The angular-translate team, Pascal Precht; Licensed MIT
 */
(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module unless amdModuleId is set
    define([], function () {
      return (factory());
    });
  } else if (typeof exports === 'object') {
    // Node. Does not work with strict CommonJS, but
    // only CommonJS-like environments that support module.exports,
    // like Node.
    module.exports = factory();
  } else {
    factory();
  }
}(this, function () {

angular.module('pascalprecht.translate')

/**
 * @ngdoc object
 * @name pascalprecht.translate.$translateCookieStorage
 * @requires $cookieStore
 *
 * @description
 * Abstraction layer for cookieStore. This service is used when telling angular-translate
 * to use cookieStore as storage.
 *
 */
  .factory('$translateCookieStorage', $translateCookieStorageFactory);

function $translateCookieStorageFactory($cookieStore) {

  'use strict';

  var $translateCookieStorage = {

    /**
     * @ngdoc function
     * @name pascalprecht.translate.$translateCookieStorage#get
     * @methodOf pascalprecht.translate.$translateCookieStorage
     *
     * @description
     * Returns an item from cookieStorage by given name.
     *
     * @param {string} name Item name
     * @return {string} Value of item name
     */
    get: function (name) {
      return $cookieStore.get(name);
    },

    /**
     * @ngdoc function
     * @name pascalprecht.translate.$translateCookieStorage#set
     * @methodOf pascalprecht.translate.$translateCookieStorage
     *
     * @description
     * Sets an item in cookieStorage by given name.
     *
     * @deprecated use #put
     *
     * @param {string} name Item name
     * @param {string} value Item value
     */
    set: function (name, value) {
      $cookieStore.put(name, value);
    },

    /**
     * @ngdoc function
     * @name pascalprecht.translate.$translateCookieStorage#put
     * @methodOf pascalprecht.translate.$translateCookieStorage
     *
     * @description
     * Sets an item in cookieStorage by given name.
     *
     * @param {string} name Item name
     * @param {string} value Item value
     */
    put: function (name, value) {
      $cookieStore.put(name, value);
    }
  };

  return $translateCookieStorage;
}
$translateCookieStorageFactory.$inject = ['$cookieStore'];

$translateCookieStorageFactory.displayName = '$translateCookieStorage';
return 'pascalprecht.translate';

}));


/*!
 * angular-translate - v2.8.1 - 2015-10-01
 * 
 * Copyright (c) 2015 The angular-translate team, Pascal Precht; Licensed MIT
 */
(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module unless amdModuleId is set
    define([], function () {
      return (factory());
    });
  } else if (typeof exports === 'object') {
    // Node. Does not work with strict CommonJS, but
    // only CommonJS-like environments that support module.exports,
    // like Node.
    module.exports = factory();
  } else {
    factory();
  }
}(this, function () {

angular.module('pascalprecht.translate')

/**
 * @ngdoc object
 * @name pascalprecht.translate.$translateMissingTranslationHandlerLog
 * @requires $log
 *
 * @description
 * Uses angular's `$log` service to give a warning when trying to translate a
 * translation id which doesn't exist.
 *
 * @returns {function} Handler function
 */
.factory('$translateMissingTranslationHandlerLog', $translateMissingTranslationHandlerLog);

function $translateMissingTranslationHandlerLog ($log) {

  'use strict';

  return function (translationId) {
    $log.warn('Translation for ' + translationId + ' doesn\'t exist');
  };
}
$translateMissingTranslationHandlerLog.$inject = ['$log'];

$translateMissingTranslationHandlerLog.displayName = '$translateMissingTranslationHandlerLog';
return 'pascalprecht.translate';

}));
