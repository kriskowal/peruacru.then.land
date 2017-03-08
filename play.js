'use strict';

var Engine = require('kni/engine');
var Document = require('./document');
var Story = require('kni/story');
var story = require('./peruacru.json');
var Point2 = require('ndim/point2');
var Region2 = require('ndim/region2');
var A = require('./animation');
var stage = require('./stage');
var Inventory = require('./inventory');

var aspectBias = 1.5;

module.exports = Play;

function Play(body, scope) {
    this.engine = null;
    this.at = -1;
    this.animator = scope.animator.add(this);
    this.animator.requestMeasure();
    this.viewportSize = new Point2();
    this.viewportCenter = new Point2();
    this.sceneSize = new Point2(1024, 842);
    this.frame = null;
    this.frameSize = new Point2();
    this.frameOffset = new Point2();
    this.frameScale = new Point2();
    this.narrativeRegion = new Region2(new Point2(), new Point2());

    this.inventory = new Inventory(this);

    this.tail = A.idle;

    // provided in init
    this.items = null;
    this.narrative = null;
    this.peruacru = null;
    this.viewport = null;
}


// -- RESPONSIVE LAYOUT --

Play.prototype.animate = function animate(action) {
    var next = this.tail.then(action);
    if (!next.then) {
        console.error('wat', this.tail.constructor.name, '->', next.constructor.name, action.constructor.name);
    }
    this.tail = next;
};

Play.prototype.measure = function measure() {
    this.viewportSize.x = window.innerWidth;
    this.viewportSize.y = window.innerHeight;
    this.animator.requestDraw();
};

Play.prototype.draw = function draw() {
    this.frameSize.copyFrom(this.sceneSize);
    if (this.viewportSize.x > this.viewportSize.y * aspectBias) {
        this.frameSize.x *= aspectBias;
        this.narrative.classList.remove('portrait');
        this.viewport.classList.remove('portrait');
    } else {
        this.frameSize.y += 714;
        this.narrative.classList.add('portrait');
        this.viewport.classList.add('portrait');
    }
    this.viewportCenter
        .copyFrom(this.viewportSize)
        .scaleThis(0.5);
    this.frameScale
        .copyFrom(this.viewportSize)
        .divThis(this.frameSize);
    var frameScale = Math.min(this.frameScale.x, this.frameScale.y);
    this.frameOffset
        .copyFrom(this.viewportSize)
        .scaleThis(1/frameScale)
        .subThis(this.frameSize)
        .scaleThis(0.5)
        .roundThis();
    this.viewport.style.transform = (
        'scale(' + frameScale + ', ' + frameScale + ') ' +
        'translate(' + this.frameOffset.x + 'px, ' + this.frameOffset.y + 'px)'
    );
};

Play.prototype.handleEvent = function handleEvent(event) {
    if (event.type === 'resize') {
        this.animator.requestMeasure();
    }
};


// -- KNI ENGINE HOOKS --

Play.prototype.answer = function _answer(answer, engine) {
};

Play.prototype.choice = function _choice(choice, engine) {
    var keywords = choice.keywords;
    console.log('> ' + keywords.join(', '));
    for (var i = 0; i < keywords.length; i++) {
        var keyword = choice.keywords[i];
        if (stage.triggers[keyword]) {
            this.animate(stage.triggers[keyword].call(this.inventory) || A.idle);
            return;
        }
    }
};

Play.prototype.ask = function ask(engine) {
    var at = engine.global.get('at');
    if (this.at !== at) {
        this.animate(new SceneChange(this, this.at, at));
        if (this.at !== -1) {
            this.animate(new A.AwaitTransitionEnd(this.peruacru));
        }
        this.at = at;
    }
    this.updateItems();
    this.updateProps();
};


Play.prototype.waypoint = function (waypoint) {
    var json = JSON.stringify(waypoint);
    window.history.pushState(waypoint, '', '#' + btoa(json));
    localStorage.setItem('peruacru.kni', json);
};


// -- HOOKUP VIEW COMPONENTS --

Play.prototype.hookup = function hookup(id, component, scope) {
    if (id === 'this') {
        this.init(scope);
    } else if (id === 'items:iteration') {
        this.initItem(component, scope);
    }
};

Play.prototype.initItem = function initItem(iteration, scope) {
    var item = iteration.value;
    item.iteration = iteration;
    item.slot = scope.components.slot;
    item.element = scope.components.item;
    item.element.classList.add(item.name);
};

Play.prototype.init = function init(scope) {
    var main = this;

    this.viewport = scope.components.viewport;
    this.peruacru = scope.components.peruacru;
    this.narrative = scope.components.narrative;
    this.items = scope.components.items;

    window.addEventListener('resize', this);

    var doc = new Document(scope.components.narrative);
    var engine = this.engine = new Engine({
        story: story,
        render: doc,
        dialog: doc,
        handler: this
    });

    doc.clear();

    var waypoint;
    var json;
    if (waypoint = window.location.hash || null) {
        try {
            waypoint = atob(waypoint.slice(1));
            waypoint = JSON.parse(waypoint);
        } catch (error) {
            console.error(error);
            waypoint = null;
        }
    } else if (json = localStorage.getItem('peruacru.kni')) {
        try {
            waypoint = JSON.parse(json);
        } catch (error) {
            console.error(error);
            waypoint = null;
        }
        window.history.replaceState(waypoint, '', '#' + btoa(json));
    }

    window.onpopstate = function onpopstate(event) {
        console.log('> back');
        engine.resume(event.state);
    };

    engine.resume(waypoint);

    window.onkeypress = function onkeypress(event) {
        var key = event.code;
        var match = /^Digit(\d+)$/.exec(key);
        if (match) {
            engine.answer(match[1]);
        } else if (key === 'KeyR') {
            engine.resume();
        } else if (key === 'KeyH' || key === 'KeyA') {
            main.go('west');
        } else if (key === 'KeyJ' || key === 'KeyS') {
            main.go('south');
        } else if (key === 'KeyK' || key === 'KeyW') {
            main.go('north');
        } else if (key === 'KeyL' || key === 'KeyD') {
            main.go('east');
        } else if (key === 'Space') {
            engine.answer('');
        }
    };

    window.onkeyup = function onkeyup(event) {
        var key = event.code;
        if (key === 'ArrowDown') {
            main.go('south');
        } else if (key === 'ArrowLeft') {
            main.go('west');
        } else if (key === 'ArrowRight') {
            main.go('east');
        } else if (key === 'ArrowUp') {
            main.go('north');
        }
    };
};

Play.prototype.go = function _go(answer) {
    var engine = this.engine;
    if (
        engine.keywords[answer] == null &&
        engine.keywords[""] != null
    ) {
        engine.answer('');
    }
    engine.answer(answer);
};


// -- SYNCHRONIZE MODEL AND STAGE/INVENTORY --
 
Play.prototype.updateItems = function updateItems() {
    this.dropItems();
    if (this.initialized) {
        this.takeItems();
    } else {
        this.initialized = true;
        this.retakeItems();
    }
};

Play.prototype.dropItems = function dropItems() {
    var animations = [];
    for (var i = 0; i < stage.items.length; i++) {
        var name = stage.items[i];
        var actual = this.inventory.count(name);
        var expected = this.engine.global.get(name.replace('-', '.'));
        while (expected < actual) {
            animations.push(this.inventory.drop(name));
            actual--;
        }
    }
    this.animate(new A.Parallel(animations));
};

Play.prototype.takeItems = function takeItems() {
    var animations = [];
    for (var i = 0; i < stage.items.length; i++) {
        var name = stage.items[i];
        var actual = this.inventory.count(name);
        var expected = this.engine.global.get(name.replace('-', '.'));
        while (expected > actual) {
            animations.push(this.inventory.take(name));
            actual++;
        }
    }
    this.animate(new A.Parallel(animations));
};

Play.prototype.retakeItems = function retakeItems() {
    for (var i = 0; i < stage.items.length; i++) {
        var name = stage.items[i];
        var actual = this.inventory.count(name);
        var expected = this.engine.global.get(name.replace('-', '.'));
        while (expected > actual) {
            this.inventory.retake(name);
            actual++;
        }
    }
};

Play.prototype.updateProps = function updateProps() {
    for (var i = 0; i < stage.props.length; i++) {
        var name = stage.props[i];
        var show = this.engine.global.get(name.replace('-', '.'));
        if (show) {
            this.inventory.showProp(name).act();
        } else {
            this.inventory.hideProp(name).act();
        }
    }
};

Play.prototype.end = function end(engine) {
    this.updateItems();
    this.updateProps();
};

Play.prototype.resetItems = function resetItems() {
    this.dropItems();
    this.retakeItems();
};

Play.prototype.addToScene = function (item) {
    this.items.value.push(item);
};

Play.prototype.removeFromScene = function (item) {
    this.items.value.swap(item.iteration.index, 1);
};

function SceneChange(main, source, target) {
    this.main = main;
    this.source = source;
    this.target = target;
}

SceneChange.prototype.act = function act() {
    var main = this.main;
    main.peruacru.classList.remove('at-' + stage.scenes[this.source]);
    main.narrative.classList.remove('at-' + stage.scenes[this.source]);
    main.peruacru.classList.add('at-' + stage.scenes[this.target]);
    main.narrative.classList.add('at-' + stage.scenes[this.target]);
};
