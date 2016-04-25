module.exports = function(grunt) {
  require('load-grunt-tasks')(grunt);
  var vars = {
    dateTime:grunt.template.today('default')
  };
  grunt.initConfig ({
    watch:{
      css:{
        files: 'assets/scss/**/*',
        tasks: ['sass']
      },
      scripts:{
        files: ['providers/**/*.js','filters/**/*.js','directives/**/*.js','utilities/**/*.js','assets/app/**/*.js'],
        tasks: ['concat'],
        options: {
          spawn: false,
        },
      }
    },
    sass:{
      dist:{
        files:{
          'assets/css/main.css': 'assets/scss/main.scss'
        }
      }
    },
    browserSync: {
      dev: {
        bsFiles: {
            src : [
                '**/*.html',
                'dist/*.js',
                'assets/app/**/*.js',
                '**/*.css'
            ]
        },
        options: {
          ghostMode: false,
          watchTask: true,
          online: true,
          port: 9001,
          server:{
            baseDir: './'
          }
        }
      },
      demo: {
        bsFiles: {
            src : [
                '**/*.html',
                '**/*.js',
                '**/*.css'
            ]
        },
        options: {
          ghostMode: false,
          watchTask: false,
          online: true,
          server:{
            baseDir: 'build/'
          }
        }
      }
    },
    useminPrepare: {
      html: './index.html',
      options: {
        src: './',
        dest: './build'
      }
    },
    usemin: {
      options: {
        assetsDirs: ['./build']
      },
      css: ['./build/assets/css/**.*.css'],
      js: ['./build/assets/js/**.*.js'],
      html: ['./build/index.html']
    },
    concat: {
      options: {
           separator: '\n\n',
           banner: grunt.template.process('\n\n// cui-ng build <%= dateTime %>\n\n', {data: vars})
      },
      dev:{
        src: ['modules/app.intro.js','assets/app/**/*.js','modules/app.outro.js'],
        dest: 'assets/concatJs/app.js'
      },
      build: {
        src: ['modules/cui-ng.intro.js','providers/**/*.js','filters/**/*.js','directives/**/*.js','utilities/**/*.js','modules/cui-ng.outro.js'],
        dest: 'dist/cui-ng.js'
      },
      buildDemo: {
        src: ['modules/app.intro.js','assets/templateCache.js','assets/app/**/*.js','modules/app.outro.js'],
        dest: 'assets/concatJs/app.js'
      }
    },
    filerev:{
      dist:{
        src:['build/assets/css/main.css','build/assets/js/vendor.js','build/assets/js/app.js']
      }
    },
    copy: {
      index: {
        src: 'index.html',
        dest: 'build/index.html'
      },
      appConfig: {
        src: 'appConfig.json',
        dest: 'build/appConfig.json'
      },
      svgs : {
        src: 'bower_components/cui-icons/dist/**/*.svg',
        dest: 'build/'
      },
      languageFiles: {
        src: 'bower_components/cui-i18n/dist/cui-i18n/angular-translate/*.json',
        dest: 'build/'
      },
      localeFiles: {
        src: 'bower_components/angular-i18n/*.js',
        dest: 'build/'
      },
      cuiI18n: {
        src: ['bower_components/cui-i18n/dist/cui-i18n/angular-translate/**/*.json'],
        dest: 'build/'
      },
      lato:{
        src: ['bower_components/lato/font/lato-regular/*.*'],
        dest: 'build/'
      }
    },
    clean: {
      build: {
        src: ["build"]
      }
    },
    uglify: {
      options: {
        sourceMap: true,
        mangle: false
      },
      dist: {
        src:'dist/cui-ng.js',
        dest:'dist/cui-ng.min.js',
        options:{
          mangle:true
        }
      }
    },
    jasmine: {
      cuiNg: {
        src: ['dist/cui-ng.js'],
        options: {
          specs: 'tests/*.js',
          helpers: ['bower_components/jquery/dist/jquery.js','bower_components/angular/angular.js','node_modules/angular-mocks/angular-mocks.js']
        }
      }
    },
    jshint: {
      all: ['directives/**/*.js','utilities/**/*.js']
    },
    ngtemplates: {
      app: {
        src: 'assets/app/**/*.html',
        dest: 'assets/templateCache.js',
        options: {
          htmlmin: {
            collapseBooleanAttributes: true,
            collapseWhiteSpace: true,
            removeAttributeQuotes: true,
            removeComments: true,
            removeEmptyAttributes: true,
            removeReduntantAttributes: true,
            removeScriptTypeAttributes: true,
            removeStyleLinkAttributes: true
          },
          module: 'app'
        }
      }
    },
    babel: {
      options: {
        sourceMap: true,
        presets: ['es2015'],
        retainLines:true
      },
      dev: {
        files: {
          'assets/concatJs/app.js': 'assets/concatJs/app.js'
        }
      },
      build: {
        files: {
          'dist/cui-ng.js': 'dist/cui-ng.js'
        }
      }
    }
  });

  grunt.registerTask('default', ['sass','concat:dev','concat:build','babel','browserSync:dev','watch']);
  grunt.registerTask('build', ['ngtemplates','sass','clean','copy','concat:build','concat:buildDemo','babel:build','uglify:dist','useminPrepare','concat:generated','cssmin:generated','uglify:generated','filerev','usemin']);
  grunt.registerTask('demo', ['browserSync:demo']);
  grunt.registerTask('test', ['concat','jasmine']);
  grunt.registerTask('lint', ['jshint']);
}
