var mongojs = require('mongojs');
var db = mongojs('localhost:27017/myGame', ['account', 'progress']);

var express = require('express');
var app = express();
var serv = require('http').Server(app);
var io = require('socket.io')(serv);

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/client/index.html');
});

app.use('/client', express.static(__dirname + '/client'));

var SOCKET_LIST = {};

var initPack = { player: [], bullet: [] };
var removePack = { player: [], bullet: [] };

var DEBUG = true;

var Entity = function () {
    var self = {
        x: 250,
        y: 250,
        spdX: 0,
        spdY: 0,
        id: '',
    }

    self.update = function () {
        self.updatePosition();
    }

    self.updatePosition = function () {
        self.x += self.spdX;
        self.y += self.spdY;
    }

    return self;
}

var Player = function (socket) {
    var self = Entity();
    self.id = socket.id;
    self.name = socket.name;
    self.number = parseInt(Math.random() * 100);
    self.pressingLeft = false;
    self.pressingRight = false;
    self.pressingUp = false;
    self.pressingDown = false;
    self.pressingAttack = false;
    self.mouseAngle = {x: 0, y: 0};
    self.maxSpd = 5;
    self.hp = 10;
    self.hpMax = 10;
    self.score = 0;

    self.super_update = self.update;
    self.update = function() {
        self.updateSdp();
        self.super_update();

        if(self.pressingAttack) {
            //  for(var i = -1; i < 1; i++)
            self.shootBullet(self.mouseAngle);
        }
    }

    self.shootBullet = function(mouseAngle) {
        var b = Bullet(self, mouseAngle);
    }

    self.updateSdp = function() {
        if(self.pressingLeft)
            self.spdX = -self.maxSpd;
        else if(self.pressingRight) 
            self.spdX = self.maxSpd;
        else 
            self.spdX = 0;
            
        if(self.pressingUp)
            self.spdY = -self.maxSpd;
        else if(self.pressingDown)
            self.spdY = self.maxSpd;
        else 
            self.spdY = 0;            
    }

    self.getInitPack = function() {
        return {
            id: self.id,
            x: self.x,
            y: self.y,
            name: self.name,
            hp: self.hp,
            hpMax: self.hpMax,
            score: self.score,
        };
    };

    self.getUpdatePack = function() {
        return {
            id: self.id,
            x: self.x,
            y: self.y,
            name: self.name,
            hp: self.hp,
            hpMax: self.hpMax,
            score: self.score,
        };
    };

    Player.list[socket.id] = self;
    initPack.player.push(self.getInitPack());
    return self;
}

Player.list = {};

Player.onConnect = function(socket) {
    var player = Player(socket);

    socket.on('keyPress', (data) => {
        var inputId = data.inputId;
        if (inputId === 'left')
            player.pressingLeft = data.state;
        if (inputId === 'right')
            player.pressingRight = data.state;
        if (inputId === 'up')
            player.pressingUp = data.state;
        if (inputId === 'down')
            player.pressingDown = data.state;
        if (inputId === 'attack')
            player.pressingAttack = data.state;
        if (inputId === 'mouseAngle')
            player.mouseAngle = data.mouseAngle;
    });

    socket.emit('init', {
        selfId: socket.id,
        player: Player.getAllInitPack(),
        bullet: Bullet.getAllInitPack(),
    });
}

Player.getAllInitPack = function() {
    var players = [];
    for(var i in Player.list)
        players.push(Player.list[i].getInitPack());
    return players;    
}

Player.onDisconnect = function(socket) {
    delete Player.list[socket.id];
    removePack.player.push({ id: socket.id});
}

Player.updatePlayer = function() {
    var pack = [];

    for (var i in Player.list) {
        var player = Player.list[i];
        player.update();
        pack.push(player.getUpdatePack());
    }
    return pack;
}



var Bullet = function (player, mouseAngle) {

    var self = Entity();
    self.x = player.x;
    self.y = player.y;
     
    self.id = Math.random();
    self.parent = player.id;

    var speed = 5;
    var dx = (mouseAngle.x - player.x);
    var dy = (mouseAngle.y - player.y);
    var mag = Math.sqrt(dx * dx + dy * dy);
    self.spdX = (dx / mag) * speed;
    self.spdY = (dy / mag) * speed;

    self.timer = 0;
    self.toRemove = false;
    self.super_update = self.update;
    self.update = function () {
        if (self.timer++ > 100) 
            self.toRemove = true;
        
        self.super_update();
        
        for(var i in Player.list) {
            var p = Player.list[i];
            if(self.getDistance(p) < 32 && self.parent !== p.id) {
                p.hp --;
                if (p.hp <= 0) {
                    var shooter = Player.list[self.parent];
                    if(shooter) shooter.score++;

                    p.hp = p.hpMax;
                    p.x = Math.random() * 500;
                    p.y = Math.random() * 500;

                }
                self.toRemove = true;
            }
        };

    };

    Bullet.list[self.id] = self;

    self.getInitPack = function() {
        return {
            id: self.id,
            x: self.x,
            y: self.y
        }
    };

    self.getUpdatePack = function() {
        return {
            id: self.id,
            x: self.x,
            y: self.y
        }
    };

    self.getDistance = function(p) {
        return Math.sqrt((self.x - p.x)*(self.x - p.x) + (self.y - p.y)*(self.y - p.y) );
    }



    initPack.bullet.push(self.getInitPack());

    return self;
}

Bullet.list = {};

Bullet.updateBullet = function() {
    var pack = [];
    for (var i in Bullet.list) {
        var bullet = Bullet.list[i];
        bullet.update();
        if (bullet.toRemove) {
            delete Bullet.list[bullet.id];
            removePack.bullet.push({
                id: bullet.id,
            });
        } else {
            pack.push(bullet.getUpdatePack());
        }
    }
    return pack;
}


Bullet.getAllInitPack = function() {
    var bullets = [];
    for(var i in Bullet.list)
        bullets.push(Bullet.list[i].getInitPack());
    return bullets;
}

var isValidAccount = function (data, callback) {
    db.account.find({ username: data.username, password: data.password}, (error, res) => {
        if(res.length > 0) 
            callback(true);
        else callback(false);
    });
    
};

var isUserNameTake = function (data, callback) {
    db.account.find({ username: data.username }, (error, res) => {
        console.log(res);
        if (res.length > 0)
            callback(false);
        else callback(true);    
    })
};

var addUser = function (data, callback) {
    db.account.insert({
        username: data.username,
        password: data.password
    }, (error, res) => {
        callback();
    });
};

io.on('connection', function (socket) {
    console.log('User connected ID: ' + socket.id);
    SOCKET_LIST[socket.id] = socket;

    socket.on('disconnect', function () {
        console.log('User disconnected ' + socket.id);
        delete SOCKET_LIST[socket.id];
        Player.onDisconnect(socket);
    });

    socket.on('addText', function (data) {
        var playerName = socket.id;
        for(var i in SOCKET_LIST) {
            SOCKET_LIST[i].emit('chatUpdate', socket.name + ": " + data);
        }
    });

    socket.on('evalServer', function (data) {
       if(!DEBUG) return;
        try {
            var res = eval(data);
            socket.emit('evalAnswer', res);
        } catch(e) {
            socket.emit('evalAnswer', 'Dont have object: ' + data);
        }
    });

    socket.on('signin', (data) => {
        isValidAccount(data, (res) => {
            if (res) {
                socket.name = data.username;
                Player.onConnect(socket);
                socket.emit('signinRes', {authenticated: true,});
            } else {
                socket.emit('signinRes', {authenticated: false,});
            }
        })
    });

    socket.on('signup', (data) => {
        isUserNameTake(data, (res) => {
            if (!res) {
                socket.emit('signupRes', {
                    state: false,
                    msg: "username is exists"
                });
            } else {
                addUser(data, () => {
                    socket.emit('signupRes', {
                        state: true,
                        msg: "signup success"
                    });
                })
            }
        });
    });


});

serv.listen(3000, () => {
    console.log('server listen port 3000');
});



setInterval(() => {

    var pack = { 
        player: Player.updatePlayer(),
        bullet: Bullet.updateBullet(),
    };

    for (var i in SOCKET_LIST) {
        var socket = SOCKET_LIST[i];
        socket.emit('init', initPack);
        socket.emit('update', pack);
        socket.emit('remove', removePack);
    }

    initPack.player = [];
    initPack.bullet = [];
    removePack.player = [];
    removePack.bullet = [];

}, 1000 / 25);
