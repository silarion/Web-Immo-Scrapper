var request = require('request');
var cheerio = require('cheerio');
var cradle = require('cradle');
var XRegExp = require('xregexp').XRegExp;
var ProgressBar = require('progress');
var settings = require('./configuration');
var moment = require('moment');
moment.locale('fr')

var bar = new ProgressBar('  [:bar] :current/:total :elapseds', {
    complete: '=',
    incomplete: ' ',
    width: 100,
    total: 0
});

cradle.setup({
    host: settings.db_host,
    cache: true,
    raw: false,
    forceSave: true,
    auth: { username: settings.db_user, password: settings.db_password }
});

var urls = ['http://www.leboncoin.fr/ventes_immobilieres/offres/lorraine/moselle/?f=a&th=1&sqs=11&ret=1&ret=2&location=Metz%2057000'
    , 'http://search.vivastreet.com/annonces-achat-vente-appartement+metz-57000?lb=new&search=1&start_field=1&keywords=&cat_1=88&cat_2=&sp_common_price%5Bstart%5D=&sp_common_price%5Bend%5D=&sp_housing_nb_rooms%5Bstart%5D=&sp_housing_nb_rooms%5Bend%5D=&sp_housing_sq_ft%5Bstart%5D=&sp_housing_sq_ft%5Bend%5D=&geosearch_text=Metz+-+57000&geo_radial_distance=0&searchGeoId=30471&end_field='
    , 'http://www.logic-immo.com/vente-immobilier-metz-57000,20369_2-c000000000-0,0-100,0-0,0-00-00-000000000000-00-0-0-3-0-0-1.html'];
//urls = [urls[2]];

var db = new(cradle.Connection)().database(settings.db_name);
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

    urls.forEach(function(url)
    {
        var regex = XRegExp('^(?<scheme> [^:/?]+ ) ://   # aka protocol   \n\
                  (?<host>   [^/?]+  )       # domain name/IP \n\
                  (?<path>   [^?]*   ) \\??  # optional path  \n\
                  (?<query>  .*      )       # optional query', 'x');
        var host = XRegExp.exec(url, regex).host;
        console.log(host)
        search(url, host);
    });

    //view all
    db.save('_design/annonces', {
        all: {
            map: function (doc) {
                emit(doc.title, doc);
            }
        }
    });

});

function search(url, host) {

    request(url, getRequestSettings(host), function (error, response, html) {

        if (error) {
            console.log('error', error);
        } else {
            // Next, we'll utilize the cheerio library on the returned html which will essentially give us jQuery functionality

            var $ = cheerio.load(
                html,
                settings.cheerio
            );

            var nextPage = getPageSuivante($, host);
            if(nextPage){
                search(nextPage, host)
            }

            var annonces = getAnnonces($, host);
            var nbTrouves = annonces.length;
            bar.total = bar.total + nbTrouves;

            annonces.each(function (index, elt) {

                var lien = getLienAnnonce($(elt), host)
                //console.log(lien)

                request(lien, getRequestSettings(host), function (error, response, html) {
                    if (error) {
                        console.log('error', error);
                    } else {
                        var $ = cheerio.load(
                            html,
                            settings.cheerio
                        );

                        var document = getInfosAnnonce($, host, lien);

                        if(document) {
                            db.save(
                                document
                                , function (err, res) {
                                    if (err) {
                                        console.log('error', err);
                                    }
                                    bar.tick();
                                }
                            );
                        }else{
                            bar.total = bar.total - 1;
                        }

                    }
                });

            });

            //console.log(myresponse)

        }
    })

}

page = 1;

/*cherche la page suivante de la recherche - sinon null*/
function getPageSuivante($, host) {
    var lienPageSuivante = null;
    switch(host){
        case "www.leboncoin.fr" :
            lienPageSuivante = $('a[href]:contains(Page suivante)');
            break;
        case "search.vivastreet.com" :
            lienPageSuivante = $('a:contains("Suivante »")');
            break;
        case "www.logic-immo.com" :
            lienPageSuivante = {href : 'http://www.logic-immo.com/vente-immobilier-metz-57000,20369_2-c000000000-0,0-100,0-0,0-00-00-000000000000-00-0-0-3-0-0-' + page++ + '.html'};
            var lastPage = $('.pgn_left').last().attr('id');
            lastPage = lastPage.replace('pgnb_left', '');
            if(page == lastPage){
                lienPageSuivante = null
            }
            break;
    }
    return lienPageSuivante ? (lienPageSuivante.attr ? lienPageSuivante.attr('href') : lienPageSuivante.href) : null;
}

/*annonces de la page de recherche*/
function getAnnonces($, host) {
    switch(host){
        case "www.leboncoin.fr" :
            return $('.list-lbc a');
            break;
        case "search.vivastreet.com" :
            return $('table.vs-classified-table tr.classified td.photo a');
            break;
        case "www.logic-immo.com" :
            return $('a[href*=detail-vente]');
            break;
    }
}

/*lien d'une annonce sur la page de recherche*/
function getLienAnnonce(elt, host) {
    switch(host){
        default :
            return elt.attr('href');
            break;
    }
}

function getInfosAnnonce($, host, lien) {
    var title = "title";
    var price = "price";
    var placement = "placement";
    var codepostal = null;
    var type = "type";
    var pieces = "pieces";
    var surface = "surface";
    var description = "description";
    var favicon = null;
    var images = [];
    var date = null;
    var time = null;
    switch(host){
        case "www.leboncoin.fr" :
            title = $('h2#ad_subject').text().trim();
            price = $('.lbcParams tr.price td').text().trim();
            var match = XRegExp.exec(price, /((?:\d+\s*)+)/ );
            if(match && match.length > 1) {
                price = match[1].replace(/ /g, '')
            }
            placement = $('.lbcParams th:contains("Ville")').next().text().trim();
            codepostal = $('.lbcParams th:contains("Code postal")').next().text().trim();
            type = $('.lbcParams th:contains("Type de bien")').next().text().trim();
            pieces = $('.lbcParams th:contains("Pièces")').next().text().trim();
            surface = $('.lbcParams th:contains("Surface")').next().text().trim();
            match = XRegExp.exec(surface, /(\d+)/ );
            if(match && match.length > 1) {
                surface = match[1]
            }
            description = $('.AdviewContent div.content').text().trim();
            favicon = 'http://' + host + '/favicon.ico'
            date = $('div.upload_by').text().trim();
            //date = moment(date, 'DD MMM hh:mm').format('DD/MM/YYYY hh:mm')
            //console.log(date + ' ' + lien + ' ' + $('div.upload_by').text().trim())
            match = XRegExp.exec(date, /le (\d+.+?)à (\d+:\d+)/ );
            if(match && match.length > 1) {
                date = match[1] + match[2];
                date = moment(date, 'DD MMM hh:mm')
                time = date.valueOf();
                date = date.format('DD/MM/YYYY hh:mm');
            }
            try {
                if ($('div.lbcImages a').length > 0) {
                    var image = $('div.lbcImages a').css('background-image');
                    image = XRegExp.replace(image, /url\('(.+)'\)/, '$1');
                    images.push({image:image})
                }
                if($('#thumbs_carousel a span').length > 0){
                    $('#thumbs_carousel a span').each(function (index, elt) {
                        if(index != 0) {
                            var image = $(elt).css('background-image');
                            image = XRegExp.replace(image, /url\('(.+)'\)/, '$1');
                            image = XRegExp.replace(image, /thumbs/, 'images');
                            images.push({image: image})
                        }
                    });
                }
            }catch(ex){
                console.log('image error : ' + lien)
            }
            break;
        case "search.vivastreet.com" :
            //price = $($('table td:contains("Prix")')[0]).next().text().trim();
            title = $('h1').text().trim();
            price = $($('table td:contains("Prix")')[0]).next().text().trim();
            var match = XRegExp.exec(price, /((?:\d+\s*)+)/ );
            if(match && match.length > 1) {
                price = match[1].replace(/ /g, '')
            }
            placement = $('table td:contains("Ville")').next().text().trim();
            codepostal = $('table td:contains("Code postal")').next().text().trim();
            match = XRegExp.exec(codepostal, /(\d{5})/);
            if(match && match.length > 1) {
                codepostal = match[1];
            }
            type = null;
            pieces = $('table td:contains("Nbre de pièces")').next().text().trim();
            surface = $('table td:contains("Surface")').next().text().trim();
            match = XRegExp.exec(surface, /(\d+)/ );
            if(match && match.length > 1) {
                surface = match[1]
            }
            description = $('div:contains("Description")').filter(function(){return $(this).text() == 'Description'}).parent().text().trim();
            favicon = 'http://media-eu.viva-images.com/global/favicon.ico'
            date = $('span:contains("Publiée par")').text().trim();
            match = XRegExp.exec(date, /(\d{2}\/\d{2}\/\d{4})/ );
            if(match && match.length > 1) {
                date = match[1];
                date = moment(date, 'DD/MM/YYYY')
                time = date.valueOf();
                date = date.format('DD/MM/YYYY');
            }
            try {
                var carousel_json = $('body script').filter(function(){return $(this).text().indexOf('carousel') > 0}).text().trim();
                carousel_json = XRegExp.replace(carousel_json, /var carousel_json = /, '');
                carousel_json = eval(carousel_json);
                if(carousel_json){
                    carousel_json.forEach(function(image)
                    {
                        images.push({image: image.url})
                    });
                }
            }catch(ex){
                console.log('image error : ' + lien + ' ' + ex)
            }
            break;
        case "www.logic-immo.com" :
            title = $('span#title-type').text().trim();
            price = $('span[itemprop=price]').text().trim();
            var match = XRegExp.exec(price, /((?:\d+\s*)+)/ );
            if(match && match.length > 1) {
                price = match[1].replace(/ /g, '')
            }
            placement = $('span#title-locality').text().trim();
            //codepostal = $('span#title-locality').text().trim();
            match = XRegExp.exec(placement, /(\d{5})/);
            if(match && match.length > 1) {
                codepostal = match[1];
            }
            type = $('span#title-type').text().trim();
            pieces = $('title').text().trim();
            match = XRegExp.exec(pieces, /(\d) pièces/ );
            if(match && match.length > 1) {
                pieces = match[1]
            }
            surface = $('title').text().trim();
            match = XRegExp.exec(surface, /(\d+) m²/ );
            if(match && match.length > 1) {
                surface = match[1]
            }
            description = $('div#description-annonce').text().trim();
            favicon = 'http://www.logic-immo.com/favicon.gif'
            date = $('.description-date').text().trim();
            match = XRegExp.exec(date, /(\d{2}\/\d{2}\/\d{4})/ );
            if(match && match.length > 1) {
                date = match[1];
                date = moment(date, 'DD/MM/YYYY')
                time = date.valueOf();
                date = date.format('DD/MM/YYYY');
            }
            try {
                if($('#detail-content img[src*="http://mmf.logic-immo.com/mmf/ads/photo-crop-69x53"]').length > 0){
                    $('#detail-content img[src*="http://mmf.logic-immo.com/mmf/ads/photo-crop-69x53"]').each(function (index, elt) {
                        var image = $(elt).attr('src');
                        image = image.replace('crop-69x53', 'prop-800x600')
                        if(images.indexOf(image) < 0) {
                            images.push(image)
                        }
                    });
                    for(var i = 0; i < images.length; i++) {
                        images[i] = {image: images[i]}
                    }
                }
            }catch(ex){
                console.log('image error : ' + lien)
            }
            break;
        default :
            return null;
    }

    var document = {
        title: title, lien: lien, placement: placement, price: price, codepostal: codepostal, type: type, pieces: pieces, surface: surface, description: description
        , images: images, host: host, favicon: favicon, date: date, time: time
    };
    //console.log(document)

    if(isExclude(document)){
        return null;
    }

    return document;

}

function isExclude(document) {
    var regex = XRegExp('(?is)(aubigny|la maxe|borny|plappeville|Mercy|Claude bernard|Schweitzer|Lessy|marly|Metz devant les ponts|QUEULEU|cathedrale|maison de village|chambley|Rembercourt|VALLIERES|Plantières|PLANTIERES|nouilly|Amanvillers|Prox .Metz|Prox.Metz|Prox. Metz|Thiaucourt|metz ouest|metz est|technopole|metz sud|sud de metz|Arnaville|km de metz|Moulins-les-metz|MARSILLY|Dans village|magny|Corny|Haraucourt|Ars sur Moselle|Mardigny|PONTOY|Village au calme|Vallières|minutes de metz|min de metz|mn de metz|WOIPPY|Metz-est|Proche de Metz|proche metz|est de metz|Ban St Martin|Norroy|Boulay|northen|LAQUENEXY|Saint-Julien|Mécleuves|frontière luxembourgeoise|TALANGE|MAIZIERES|saulcy|augny|longeville|CHEMINOT|Bridoux|ST JULIEN|BAN SAINT MARTIN|Moulins Les Metz)');
    if(regex.test(document.title + document.description)){
        return true;
    }
    if(document.codepostal && document.codepostal != "57000"){
        return true;
    }
    if(Number(document.surface) < 100){
        return true;
    }
    return false;
}

function getRequestSettings(host) {
    switch(host){
        case "www.leboncoin.fr" :
            settings.request.encoding = 'binary';
            break;
        default :
            settings.request.encoding = 'utf8';
            break;
    }
    return settings.request;
}