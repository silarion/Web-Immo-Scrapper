var annoncesApp = angular.module('annoncesApp', []);

annoncesApp.controller('AnnoncesList', function ($scope, $http) {
    $http.get('/list').success(function(data) {
        data.forEach(function(elt){
            elt.price = new Number(elt.price)
        });
        $scope.annonces = data;
    });

    $scope.orderProp = '-time';
});