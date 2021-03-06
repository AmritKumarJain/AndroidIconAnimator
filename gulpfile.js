/*
 * Copyright 2016 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

// Include Gulp & Tools We'll Use
var gulp = require('gulp');
var $ = require('gulp-load-plugins')();
var del = require('del');
var fs = require('fs');
var source = require('vinyl-source-stream');
var buffer = require('vinyl-buffer');
var runSequence = require('run-sequence');
var browserSync = require('browser-sync');
var browserify = require('browserify');
var exclude = require('gulp-ignore').exclude;
var reload = browserSync.reload;
var history = require('connect-history-api-fallback');
var merge = require('merge-stream');


var AUTOPREFIXER_BROWSERS = [
  'ie >= 10',
  'ie_mob >= 10',
  'ff >= 30',
  'chrome >= 34',
  'safari >= 7',
  'ios >= 7',
  'android >= 4.4'
];


var DEV_MODE = false;
var BASE_HREF = '/AndroidIconAnimator/';


function errorHandler(error) {
  console.error(error.stack);
  this.emit('end'); // http://stackoverflow.com/questions/23971388
}

// Lint JavaScript
gulp.task('scripts', function () {
  return browserify('./app/scripts/app.js', {
        debug: true, // debug generates sourcemap
        basedir: '.',
        paths: [
          './app/scripts/',
          './node_modules/'
        ]
      })
      .transform('babelify', {
        presets: ['es2015'],
        plugins: ['transform-decorators-legacy']
      })
      .transform('require-globify')
      .bundle()
      .on('error', errorHandler)
      .pipe(source('app.js'))
      .pipe(buffer())
      .pipe(gulp.dest('.tmp/scripts'))
      .pipe($.if(!DEV_MODE, $.uglify({
        mangle:false
      })))
      .pipe(gulp.dest('dist/scripts'));
});

// Bower
gulp.task('bower', function(cb) {
  return $.bower('.tmp/lib')
      .pipe(exclude('!**/*.{js,css,map}'))
      .pipe(exclude('**/test/**'))
      .pipe(exclude('**/tests/**'))
      .pipe(exclude('**/modules/**'))
      .pipe(exclude('**/demos/**'))
      .pipe(exclude('**/src/**'))
      .pipe(gulp.dest('dist/lib'));
});

// Optimize Images
gulp.task('images', function () {
  return gulp.src('app/images/**/*')
    .pipe($.cache($.imagemin({
      progressive: true,
      interlaced: true
    })))
    .pipe(gulp.dest('dist/images'))
    .pipe($.size({title: 'images'}));
});

// Generate icon set
gulp.task('icons', function () {
  return gulp.src('app/icons/**/*.svg')
    .pipe($.cache($.imagemin({
      progressive: true,
      interlaced: true
    })))
    .pipe($.svgNgmaterial({filename: 'icons.svg'}))
    .pipe(gulp.dest('dist/images'))
    .pipe(gulp.dest('.tmp/images'))
    .pipe($.size({title: 'icons'}));
});

// Copy All Files At The Root Level (app) and lib
gulp.task('copy', function () {
  var s1 = gulp.src([
    'app/*',
    '!app/icons',
    '!app/*.html'
  ], {
    dot: true
  }).pipe(gulp.dest('dist'))
    .pipe($.size({title: 'copy'}));

  var s2 = gulp.src('app/assets/**/*')
      .pipe(gulp.dest('dist/assets'))
      .pipe($.size({title: 'assets'}));

  return merge(s1, s2);
});

// Libs
gulp.task('lib', function () {
  return gulp.src(['app/lib/**/*'], {dot: true})
      .pipe(gulp.dest('dist/lib'))
      .pipe($.size({title: 'lib'}));
});

// Compile and Automatically Prefix Stylesheets
gulp.task('styles', function () {
  // For best performance, don't add Sass partials to `gulp.src`
  return gulp.src('app/styles/app.scss')
    .pipe($.changed('styles', {extension: '.scss'}))
    .pipe($.sassGlob())
    .pipe($.sass({
      style: 'expanded',
      precision: 10,
      quiet: true
    }).on('error', errorHandler))
    .pipe($.autoprefixer(AUTOPREFIXER_BROWSERS))
    .pipe(gulp.dest('.tmp/styles'))
    // Concatenate And Minify Styles
    .pipe($.if(!DEV_MODE, $.if('*.css', $.csso())))
    .pipe(gulp.dest('dist/styles'))
    .pipe($.size({title: 'styles'}));
});


function currentVersionInfo() {
  return new Promise((resolve, reject) => {
    if (DEV_MODE) {
      resolve({version: 'DEV_BUILD'});
    } else {
      $.git.revParse({args: '--short HEAD'}, (err, hash) => {
        $.git.exec({args: 'describe --tags'}, (err, tag) => {
          tag = tag.replace(/\s/g, '');
          resolve({version: `${tag} (build ${hash})`});
        });
      });
    }
  });
}


gulp.task('html', function() {
  return currentVersionInfo().then((versionInfo) =>
      gulp.src('app/**/*.html')
          .pipe($.replace(/%%BASE_HREF%%/g, BASE_HREF))
          .pipe($.replace(/%%VERSION%%/g, versionInfo.version))
          .pipe(gulp.dest('.tmp'))
          .pipe($.if('*.html', $.minifyHtml({empty:true})))
          .pipe(gulp.dest('dist'))
          .pipe($.size({title: 'html'})));
});

// Clean Output Directory
gulp.task('clean', function(cb) {
  del.sync(['.tmp', 'dist']);
  $.cache.clearAll();
  cb();
});

// Watch Files For Changes & Reload
gulp.task('serve', function (cb) {
  DEV_MODE = true;
  BASE_HREF = '/';
  runSequence('__serve__', cb);
});

gulp.task('__serve__', ['styles', 'scripts', 'icons', 'bower', 'html'], function () {
  browserSync({
    notify: false,
    // Run as an https by uncommenting 'https: true'
    // Note: this uses an unsigned certificate which on first access
    //       will present a certificate warning in the browser.
    // https: true,
    server: {
      baseDir: ['.tmp', 'app'],
      routes: {
        '/_sandbox': '_sandbox'
      },
      middleware: [history()]
    }
  });

  gulp.watch(['app/**/*.html'], ['html', reload]);
  gulp.watch(['app/**/*.{scss,css}'], ['styles', reload]);
  gulp.watch(['app/**/*.js'], ['scripts', reload]);
  gulp.watch(['app/images/**/*'], reload);
  gulp.watch(['app/icons/**/*'], ['icons', reload]);
  gulp.watch(['app/assets/**/*'], reload);
});

// Build and serve the output from the dist build
gulp.task('serve:dist', ['default'], function () {
  browserSync({
    notify: false,
    // Run as an https by uncommenting 'https: true'
    // Note: this uses an unsigned certificate which on first access
    //       will present a certificate warning in the browser.
    // https: true,
    server: 'dist'
  });
});

// Build Production Files, the Default Task
gulp.task('default', ['clean', 'test'], function (cb) {
  runSequence('styles',
      ['scripts', 'bower', 'html', 'images', 'icons', 'lib', 'copy'],
      cb);
});

// Tests
gulp.task('test', function (cb) {
  return gulp.src(['test/**/*.js'], {read: false})
      .pipe($.mocha({
        reporter: 'nyan',
        require: ['babel-register'],
      }));
});

// Deploy to GitHub pages
gulp.task('deploy', function() {
  return gulp.src('dist/**/*', {dot: true})
    .pipe($.ghPages());
});

// Load custom tasks from the `tasks` directory
try { require('require-dir')('tasks'); } catch (err) {}
