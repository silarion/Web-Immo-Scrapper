var request = require('request');
var cheerio = require('cheerio');
var cradle = require('cradle');
var XRegExp = require('xregexp').XRegExp;
var ProgressBar = require('progress');
var settings = require('./configuration');

cradle.setup({
    host: settings.db_host,
    cache: true,
    raw: false,
    forceSave: true,
    auth: { username: settings.db_user, password: settings.db_password }
});
var db = new(cradle.Connection)().database('immobilier');
db.exists(function (err, exists) {
    if (err) {
        console.log('error', err);
    } else if (exists) {
        console.log('database exists.');
        db.destroy(function(){});
        db.create();
    } else {
        console.log('database creation.');
        db.create();
    }
    leboncoin();
});

function leboncoin() {
    var url = 'http://www.leboncoin.fr/ventes_immobilieres/offres/lorraine/moselle/?f=a&th=1&sqs=12&ret=1&ret=2&location=Metz%2057000';

    // The structure of our request call
    // The first parameter is our URL
    // The callback function takes 3 parameters, an error, response status code and the html

    request(url, function (error, response, html) {

        // First we'll check to make sure no errors occurred when making the request

        if (error) {
            console.log('error', error);
        }else{
            // Next, we'll utilize the cheerio library on the returned html which will essentially give us jQuery functionality

            var $ = cheerio.load(
                html,
                {
                    normalizeWhitespace: true,
                    xmlMode: false,
                    decodeEntities: true
                }
            );

            // Finally, we'll define the variables we're going to capture

            var annonces = $('.list-lbc a');
            var nbTrouves = annonces.length;
            console.log(nbTrouves + " annonces trouvees");
            var bar = new ProgressBar('  [:bar] :current/:total :elapseds', {
                complete: '=',
                incomplete: ' ',
                width: 20,
                total: nbTrouves
            });
            annonces.each(function (index, elt) {

                var lien = $(elt).attr('href')
                var title = $(elt).attr('title').trim();
                var placement = $(elt).find('.placement').text().trim();
                var price = $(elt).find('.price').text().trim();

                request(lien, function (error, response, html) {
                    if(error){
                        console.log('error', error);
                    }else{
                        var $ = cheerio.load(
                            html,
                            {
                                normalizeWhitespace: true,
                                xmlMode: false,
                                decodeEntities: true
                            }
                        );
                        var params = $('.lbcParams td');
                        var codepostal = $(params[2]).text();
                        var type = $(params[4]).text();
                        var pieces = $(params[5]).text();
                        var surface = $(params[6]).text();

                        var document = {
                            title: title
                            , lien: lien
                            , placement: placement
                            , price: price
                            , codepostal: codepostal
                            , type: type
                            , pieces: pieces
                            , sureface: surface
                        };

                        db.save(
                            title
                            , document
                            , function (err, res) {
                                if (err) {
                                    console.log('error', err);
                                }
                                bar.tick();
                        });

                    }
                });

            });

            //console.log(myresponse)

        }
    })
}




