angular.module('cui-ng')
.directive('cuiExpandable',($compile) => {
    return {
        restrict: 'E',
        transclude: true,
        link: (scope, elem, attrs, ctrl, transclude) => {
            const newScope = scope.$new()
            scope.$on('$destroy',() => newScope.$destroy())

            transclude(newScope, (clone, innerScope) => {
                elem.append(clone)
            })

            const expandableBody = angular.element(elem[0].querySelector('cui-expandable-body'))
            expandableBody.hide() // hide the body by default

            const toggleClass = () => {
                elem.toggleClass('expanded')
            }
            const toggleBody = () => {
                expandableBody.animate({'height':'toggle'}, parseInt(elem.attr('transition-speed') || 300) ,'linear')
            }

            newScope.toggleExpand = (event) => {
                // this way labels won't toggle expand twice
                if(event && event.target.tagName==='INPUT' && event.target.labels && event.target.labels.length > 0 ) return;
                toggleClass();
            }
            newScope.expand = () => {
                if(!newScope.expanded) toggleClass();
            }
            newScope.collapse = () => {
                if(newScope.expanded) toggleClass()
            }
            newScope.$watch(() => elem.attr('class') || '' , (newValue,oldValue) => {
                if(oldValue === newValue && newValue.indexOf('expanded') > -1 ){ // if the element the expanded class put in by default
                    newScope.expanded = true
                    toggleBody()
                }
                else if(newValue.indexOf('expanded') === -1){
                    if(newScope.expanded===true) toggleBody()
                    newScope.expanded=false
                }
                else{
                    if(newScope.expanded===false) toggleBody()
                    newScope.expanded=true
                }
            })
        }
    }
})