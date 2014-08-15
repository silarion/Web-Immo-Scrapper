var express = require('express');
var path = require('path');
var favicon = require('static-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');

var routes = require('./routes/index');
var users = require('./routes/users');

var request = require('request');
var cheerio = require('cheerio');
var settings = require('./configuration');

var cradle = require('cradle');
cradle.setup({
    host: settings.db_host,
    cache: true,
    raw: false,
    forceSave: true,
    auth: { username: settings.db_user, password: settings.db_password }
});
var db = new(cradle.Connection)().database('immobilier');

var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(favicon());
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded());
app.use(cookieParser());
app.use(require('less-middleware')(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', routes);
app.use('/users', users);

app.get('/scrape', function(req, res){
    // The URL we will scrape from - in our example Anchorman 2.

    url = 'http://www.leboncoin.fr/ventes_immobilieres/offres/lorraine/moselle/?f=a&th=1&sqs=12&ret=1&ret=2&location=Metz%2057000';

    // The structure of our request call
    // The first parameter is our URL
    // The callback function takes 3 parameters, an error, response status code and the html

    var myresponse = [];

    db.all(function (err, document) {
        myresponse.push(document);
        res.send(myresponse)
    });


})

/// catch 404 and forward to error handler
app.use(function(req, res, next) {
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
});

/// error handlers

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
    app.use(function(err, req, res, next) {
        res.status(err.status || 500);
        res.render('error', {
            message: err.message,
            error: err
        });
    });
}

// production error handler
// no stacktraces leaked to user
app.use(function(err, req, res, next) {
    res.status(err.status || 500);
    res.render('error', {
        message: err.message,
        error: {}
    });
});



module.exports = app;

app.listen('8081')

console.log('Magic happens on port 8081');



