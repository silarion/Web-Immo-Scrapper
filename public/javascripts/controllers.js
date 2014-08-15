var annoncesApp = angular.module('annoncesApp', []);

annoncesApp.controller('AnnoncesList', function ($scope, $http) {
    $http.get('/list').success(function(data) {
        $scope.annonces = data;
    });
});