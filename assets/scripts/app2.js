(function(angular){
    'use strict';

    angular
    .module('app',[])
    .controller('appCtrl',[function(){
        var app=this;
        app.user={
            name: 'Bill Murray',
            avatar: '//www.fillmurray.com/200/200'
        };
        app.logo='assets/img/logo.png';

        //for the wizard
        app.step=1;
        app.organization={};
        app.organization.name='Thirdwave LLC';
        app.organization.divisions=['Web design','UI development','Wordpress development','Ruby development'];
        app.organization.cities=['Chicago','Aurora','Rockford','Joliet','Naperville','Springfiled'];
        app.organization.states=['IL','FL','NY','CA'];
        app.organization.countries=['U.S.A','Portugal','Spain'];
    }])


    //cui-header ----------------------------------
    .directive('cuiHeader',[function(){
        return{
            restrict: 'E',
            replace:true,
            templateUrl:'assets/angular-templates/header.html',
            link: function(scope,elem,attrs){
                //read attributes
                var logo;
                attrs.logo!==undefined ? logo = attrs.logo : true;
                attrs.user!==undefined ? scope.cuiUser = attrs.user : true;
                attrs.topMenu!==undefined ? scope.cuiTopMenu=true : scope.cuiTopMenu=false;
                
                //set logo image
                var $logo = document.querySelector('.cui__header__logo');
                $logo.style.backgroundImage = 'url("' + logo + '")';
            }
        }
    }])


    //cui-avatar -----------------------------------
    .directive('cuiAvatar',[function(){
        return{
            restrict: 'E',
            templateUrl:'assets/angular-templates/avatar.html',
            link:function(scope,elem,attrs){
                //read attributes
                var user;
                attrs.user!==undefined ? user=attrs.user : console.log('No user passed.');

                scope.userName=user.name;
            }
        }
    }])

    //cui-wizard
    .directive('cuiWizard',['$timeout',function($timeout){
        return{
            restrict: 'E',
            link:function(scope,elem,attrs){
                //init
                var init = function(){
                        scope.$steps=document.querySelectorAll('cui-wizard>step');
                        scope.$indicatorContainer=document.querySelector('indicator-container');
                        scope.next=function(){
                            elem[0].attributes.step.value++;
                            updateIndicator();
                        };
                        createIndicators();
                        updateIndicator();
                    },
                    // creates indicators inside of <indicator-container>
                    createIndicators = function(){
                        var numberOfSteps=scope.$steps.length,
                            stepTitles=[];
                        for(var i=0;i<numberOfSteps;i++){
                            stepTitles[i]=scope.$steps[i].attributes.title.value;
                        }
                        stepTitles.forEach(function(e,i){
                            var div='<div class="step__indicator">' + stepTitles[i] + '</div>';
                            scope.$indicatorContainer.innerHTML+=div;
                        })
                        scope.$indicators=document.querySelectorAll('.step__indicator');
                    },
                    // updates the current active indicator. Removes active class from other elements.
                    updateIndicator = function(){
                        $timeout(function(){
                            var currentStep=elem[0].attributes.step.value;
                            for(var i=0; i<scope.$steps.length ; i++){
                                scope.$steps[i].classList.remove('active');
                                scope.$indicators[i].classList.remove('active');
                            }
                            scope.$steps[currentStep-1].classList.add('active');
                            scope.$indicators[currentStep-1].classList.add('active');
                        });
                    };

                init();
            }
        }
    }]);

})(angular)