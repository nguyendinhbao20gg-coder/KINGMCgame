var express = require('express');
var app = express();
app.use(express.static('./www'));

var server = require('http').Server(app);
var io = require('socket.io')(server);

// port
server.listen(process.env.PORT || 3000, function(){
	console.log('server dang chay....');
});

// ===================== GAME TÀI XỈU =====================

var Taixiu = function(){

    // cài đặt
    this.idPhien             = 0;
    this.timeDatCuoc         = 40; // THAY ĐỔI: 60s -> 40s
    this.timechophienmoi     = 10;
    this.soNguoiChonTai      = 0;
    this.soNguoiChonXiu      = 0;
    this.tongTienDatTai      = 0;
    this.tongTienDatXiu      = 0;
    this.time                = this.timeDatCuoc;
    this.coTheDatCuoc        = true;
    this.idChonTai           = {};
    this.idChonXiu           = {};
    this.ketQua              = '';
    this.daTinhThuong        = false; // Thêm biến kiểm tra đã tính thưởng chưa

    // game bắt đầu
    this.gameStart = function(){
        var seft = this;
        seft.idPhien ++;
        seft.coTheDatCuoc        = true;
        seft.soNguoiChonTai      = 0;
        seft.soNguoiChonXiu      = 0;
        seft.tongTienDatTai      = 0;
        seft.tongTienDatXiu      = 0;
        seft.idChonTai           = {};
        seft.idChonXiu           = {};
        seft.time = seft.timeDatCuoc;
        seft.daTinhThuong        = false; // Reset khi bắt đầu game mới
        console.log('🆕 Game mới - Phiên #' + seft.idPhien + ' (40s đặt cược)');
        io.sockets.emit('gameStart', seft.ketQua);
        
        var loopAGame = setInterval(function() {              
            seft.time--;
            io.sockets.emit('gameData', { 
                idGame        : seft.idPhien,
                soNguoiChonTai: seft.soNguoiChonTai, 
                soNguoiChonXiu: seft.soNguoiChonXiu, 
                tongTienDatTai: seft.tongTienDatTai, 
                tongTienDatXiu: seft.tongTienDatXiu, 
                time          : seft.time
            });
            
            if (seft.time == 0){
                clearInterval(loopAGame);
                seft.gameOver();
            }
        }, 1000);
    };
    
    // game kết thúc (tạo kết quả nhưng CHƯA tính tiền)
    this.gameOver = function(){
        var seft = this;
        seft.coTheDatCuoc = false;
        seft.time = seft.timechophienmoi;
        this.ketQua = seft.gameRandomResult();
        seft.daTinhThuong = false; // Chưa tính thưởng
        
        console.log('🎲 Kết quả phiên #' + seft.idPhien + ': ' + this.ketQua.result.toUpperCase());
        console.log('  🎲 Dice: ' + this.ketQua.dice1 + ' + ' + this.ketQua.dice2 + ' + ' + this.ketQua.dice3 + ' = ' + (this.ketQua.dice1 + this.ketQua.dice2 + this.ketQua.dice3));
        
        // Gửi kết quả nhưng CHƯA TÍNH TIỀN
        io.sockets.emit('gameOver', this.ketQua);
        
        // KHÔNG TÍNH TIỀN Ở ĐÂY NỮA - ĐỢI CLIENT KÉO BÁT (NẶN)
        
        var loopAGame = setInterval(function() {   
            seft.time --;   
            io.sockets.emit('gameData', { 
                idGame        : seft.idPhien,
                soNguoiChonTai: seft.soNguoiChonTai, 
                soNguoiChonXiu: seft.soNguoiChonXiu, 
                tongTienDatTai: seft.tongTienDatTai, 
                tongTienDatXiu: seft.tongTienDatXiu, 
                time          : seft.time
            });
            if (seft.time == 0){
                clearInterval(loopAGame);
                // Nếu đến lúc bắt đầu game mới mà chưa tính thưởng, tự động tính
                if (!seft.daTinhThuong) {
                    seft.tinhThuong();
                }
                seft.gameStart();
            }
        }, 1000);
    };
    
    // ===== HÀM TÍNH THƯỞNG (GỌI KHI NẶN XONG) =====
    this.tinhThuong = function(){
        var seft = this;
        if (seft.daTinhThuong) return; // Đã tính rồi thì thôi
        
        var ketQua = seft.ketQua;
        if (!ketQua || !ketQua.result) return;
        
        seft.daTinhThuong = true;
        
        // Xác định người thắng
        var idWin = ketQua.result == 'tai' ? seft.idChonTai : seft.idChonXiu;
        
        console.log('💰 Đang tính thưởng cho ' + Object.keys(idWin).length + ' người chơi...');
        
        for (var id in idWin) {
            var data = idWin[id];
            // TÍNH TIỀN THẮNG (x2)
            var winAmount = data.tien * 2;
            
            // CỘNG TIỀN VÀO BALANCE
            if (players[id]) {
                players[id].balance += winAmount;
                var balance = players[id].balance;
                console.log('💰 ' + players[id].name + ' thắng +' + winAmount + ' coins, balance: ' + balance);
                
                // Gửi thông báo thắng kèm balance mới
                io.to(id).emit('winGame', {
                    msg: '🎉 Bạn đã thắng ' + winAmount.toLocaleString() + ' coins! 🎉',
                    balance: balance,
                    winAmount: winAmount
                });
                
                // Gửi cập nhật balance
                io.to(id).emit('balanceUpdate', {
                    balance: balance
                });
            }
        }
        
        // Gửi balance cho tất cả người chơi
        for (var socketId in players) {
            if (players[socketId]) {
                io.to(socketId).emit('balanceUpdate', {
                    balance: players[socketId].balance
                });
            }
        }
        
        // Cập nhật danh sách người chơi
        io.sockets.emit('adminPlayerList', {
            players: getPlayersList()
        });
        
        console.log('✅ Đã tính thưởng xong!');
    };
    
    // đặt cược
    this.putMoney = function(id, cau, tien){
        if (this.coTheDatCuoc == false){
            return {
                status  : 'error',
                error   : '⏳ Không thể đặt, vui lòng chờ giây lát'
            };
        }
        // Kiểm tra số dư
        if (players[id] && players[id].balance < tien) {
            return {
                status  : 'error',
                error   : '❌ Không đủ số dư! (Cần ' + tien.toLocaleString() + ' coins)'
            };
        }
        
        if(cau == 'tai'){
            this.tongTienDatTai += tien;
            if(!this.idChonTai[id]){ 
                this.idChonTai[id] = {
                    id   : id,
                    cau  : 'tai',
                    tien : tien
                };
                this.soNguoiChonTai ++;
            }else{
                this.idChonTai[id].tien += tien;
            }
        }else if(cau == 'xiu'){
            this.tongTienDatXiu += tien;
            if(!this.idChonXiu[id]){ 
                this.idChonXiu[id] = {
                    id   : id,
                    cau  : 'xiu',
                    tien : tien
                };
                this.soNguoiChonXiu ++;
            }else{
                this.idChonXiu[id].tien += tien;
            }
        }
        
        // Trừ tiền khỏi balance
        if (players[id]) {
            players[id].balance -= tien;
        }
        
        return {
            status  : 'success',
            msg     : '✅ Đặt cược ' + tien.toLocaleString() + ' coins thành công!',
            balance : players[id] ? players[id].balance : 0
        };
    };
    
    // random kết quả
    this.gameRandomResult = function(){
        // Kiểm tra force result từ admin
        if (global.forceResult && global.forceResult !== '') {
            var force = global.forceResult;
            var dice1, dice2, dice3;
            if (force === 'tai') {
                do {
                    dice1 = Math.floor(1 + Math.random() * 6);
                    dice2 = Math.floor(1 + Math.random() * 6);
                    dice3 = Math.floor(1 + Math.random() * 6);
                } while (dice1 + dice2 + dice3 <= 9);
            } else {
                do {
                    dice1 = Math.floor(1 + Math.random() * 6);
                    dice2 = Math.floor(1 + Math.random() * 6);
                    dice3 = Math.floor(1 + Math.random() * 6);
                } while (dice1 + dice2 + dice3 > 9);
            }
            return {
                dice1: dice1,
                dice2: dice2,
                dice3: dice3,
                tong: dice1 + dice2 + dice3,
                result: force
            };
        }
        
        var dice1 = Math.floor(1 + Math.random() * 6);
        var dice2 = Math.floor(1 + Math.random() * 6);
        var dice3 = Math.floor(1 + Math.random() * 6);
        var tong = dice1 + dice2 + dice3;
        return {
            dice1   : dice1,
            dice2   : dice2,
            dice3   : dice3,
            tong    : tong,
            result  : tong <= 9 ? 'xiu' : 'tai'
        };
    };
};

// ===================== LƯU TRỮ NGƯỜI CHƠI =====================
var players = {};

// ===================== HÀM LẤY DANH SÁCH NGƯỜI CHƠI =====================
function getPlayersList() {
    var list = [];
    for (var id in players) {
        if (players[id]) {
            list.push({
                id: id,
                name: players[id].name || id,
                balance: players[id].balance || 0
            });
        }
    }
    return list;
}

// ===================== TẠO GAME =====================
var tx = new Taixiu();

// ===================== LỊCH SỬ SOI CẦU =====================
var historyResults = [];
var MAX_HISTORY = 20;

function predictResult() {
    if (historyResults.length < 3) {
        return { 
            predict: 'chưa đủ dữ liệu', 
            confidence: 0,
            suggestion: 'Hãy chờ thêm vài ván để soi cầu',
            totalHistory: historyResults.length,
            taiRate: 0,
            xiuRate: 0,
            isStreak: false
        };
    }
    
    var taiCount = 0;
    var xiuCount = 0;
    var lastResults = historyResults.slice(-10);
    
    lastResults.forEach(function(r) {
        if (r === 'tai') taiCount++;
        else xiuCount++;
    });
    
    var total = lastResults.length;
    var taiRate = (taiCount / total * 100).toFixed(1);
    var xiuRate = (xiuCount / total * 100).toFixed(1);
    
    var predict = taiCount > xiuCount ? 'tai' : 'xiu';
    var confidence = Math.abs(taiCount - xiuCount) / total * 100;
    
    var isStreak = false;
    var streakType = '';
    var streakCount = 0;
    
    var recent = historyResults.slice(-5);
    if (recent.length >= 3) {
        var first = recent[0];
        var allSame = recent.every(function(r) { return r === first; });
        if (allSame) {
            isStreak = true;
            streakType = first;
            streakCount = recent.length;
        }
    }
    
    return {
        predict: predict,
        confidence: Math.round(confidence),
        taiRate: taiRate,
        xiuRate: xiuRate,
        totalHistory: historyResults.length,
        isStreak: isStreak,
        streakType: streakType,
        streakCount: streakCount,
        suggestion: isStreak ? '⚠️ Cầu ' + streakType + ' đang chạy ' + streakCount + ' ván!' : 'Chưa có cầu rõ ràng'
    };
}

// Lưu lịch sử khi gameOver
var originalGameOver = tx.gameOver;
tx.gameOver = function() {
    if (this.ketQua && this.ketQua.result) {
        historyResults.push(this.ketQua.result);
        if (historyResults.length > MAX_HISTORY) {
            historyResults.shift();
        }
    }
    originalGameOver.call(this);
};

console.log('🎯 Chức năng soi cầu đã sẵn sàng!');

// ===================== ADMIN FUNCTIONS =====================
function adminCheckPassword(pass) {
    return pass === 'admin123';
}

// ===================== HÀM CHUYỂN ĐỔI TIỀN =====================
function parseMoney(input) {
    if (typeof input === 'string') {
        input = input.toLowerCase().trim();
        input = input.replace(/,/g, '').replace(/ /g, '');
        
        var multipliers = {
            'k': 1000,
            'm': 1000000,
            'b': 1000000000
        };
        
        for (var key in multipliers) {
            if (input.endsWith(key)) {
                var num = parseFloat(input.slice(0, -1));
                if (!isNaN(num)) {
                    return Math.floor(num * multipliers[key]);
                }
            }
        }
        
        if (input.includes('nghìn')) {
            var num = parseFloat(input.replace('nghìn', ''));
            if (!isNaN(num)) return Math.floor(num * 1000);
        }
        if (input.includes('triệu')) {
            var num = parseFloat(input.replace('triệu', ''));
            if (!isNaN(num)) return Math.floor(num * 1000000);
        }
        if (input.includes('tỷ')) {
            var num = parseFloat(input.replace('tỷ', ''));
            if (!isNaN(num)) return Math.floor(num * 1000000000);
        }
        
        var val = parseFloat(input);
        if (!isNaN(val)) return Math.floor(val);
    }
    return Math.floor(Number(input)) || 0;
}

// ===================== SOCKET.IO =====================
io.on('connection', function (socket) {
    console.log('🟢 Người chơi kết nối: ' + socket.id);

    // Khởi tạo player nếu chưa có
    if (!players[socket.id]) {
        players[socket.id] = {
            balance: 1000000,
            name: 'Player_' + socket.id.substring(0, 6)
        };
    }

    // Gửi thông tin user
    socket.emit('userInfo', {
        username: players[socket.id].name,
        balance: players[socket.id].balance
    });

    socket.emit('adminPlayerList', {
        players: getPlayersList()
    });

    // Đặt cược
    socket.on('pull', function (data) {
        if (data.name) {
            players[socket.id].name = data.name;
        }
        
        var money = parseMoney(data.money);
        
        if (money <= 0) {
            socket.emit('pull', {
                status: 'error',
                error: '⚠️ Vui lòng nhập số tiền hợp lệ! (VD: 100k, 1m)'
            });
            return;
        }
        
        var msg = tx.putMoney(socket.id, data.dice, money);
        if (msg.status === 'success') {
            msg.balance = players[socket.id].balance;
            socket.emit('balanceUpdate', {
                balance: players[socket.id].balance
            });
        }
        socket.emit('pull', msg);
        
        io.sockets.emit('adminPlayerList', {
            players: getPlayersList()
        });
    });

    // ===== CLIENT BÁO ĐÃ NẶN XONG =====
    socket.on('nhanXong', function(data) {
        console.log('👤 ' + (players[socket.id]?.name || socket.id) + ' đã nặn xong!');
        // Gọi tính thưởng nếu chưa tính
        if (tx && !tx.daTinhThuong) {
            tx.tinhThuong();
        }
    });

    // SOI CẦU
    socket.on('predict', function () {
        var result = predictResult();
        socket.emit('predictResult', result);
    });

    // Lấy lịch sử
    socket.on('getHistory', function () {
        socket.emit('historyResult', {
            history: historyResults,
            total: historyResults.length
        });
    });

    // Lấy danh sách người chơi
    socket.on('getPlayers', function () {
        socket.emit('adminPlayerList', {
            players: getPlayersList()
        });
    });

    // ===== ADMIN ACTIONS =====
    socket.on('adminAddMyself', function(data) {
        var pass = data.password || '';
        if (!adminCheckPassword(pass)) {
            socket.emit('adminResult', {
                status: 'error',
                message: '❌ Sai mật khẩu admin!'
            });
            return;
        }
        var amount = parseMoney(data.amount) || 0;
        if (amount <= 0) {
            socket.emit('adminResult', {
                status: 'error',
                message: '⚠️ Số tiền không hợp lệ! (VD: 100k, 1m)'
            });
            return;
        }
        players[socket.id].balance += amount;
        socket.emit('balanceUpdate', {
            balance: players[socket.id].balance
        });
        socket.emit('adminResult', {
            status: 'success',
            message: '👤 Đã cộng ' + amount.toLocaleString() + ' coins cho bạn!',
            balance: players[socket.id].balance,
            user: players[socket.id].name
        });
        io.sockets.emit('adminPlayerList', {
            players: getPlayersList()
        });
    });

    socket.on('adminSetBalance', function(data) {
        var pass = data.password || '';
        if (!adminCheckPassword(pass)) {
            socket.emit('adminResult', {
                status: 'error',
                message: '❌ Sai mật khẩu admin!'
            });
            return;
        }
        var user = data.user;
        var amount = parseMoney(data.amount) || 0;
        var found = false;
        for (var id in players) {
            if (players[id].name === user || id === user) {
                players[id].balance = amount;
                found = true;
                io.to(id).emit('balanceUpdate', {
                    balance: players[id].balance
                });
                break;
            }
        }
        if (!found) {
            socket.emit('adminResult', {
                status: 'error',
                message: '❌ Không tìm thấy người chơi!'
            });
            return;
        }
        socket.emit('adminResult', {
            status: 'success',
            message: '✅ Đã set ' + user + ' = ' + amount.toLocaleString() + ' coins'
        });
        io.sockets.emit('adminPlayerList', {
            players: getPlayersList()
        });
    });

    socket.on('adminAddBalance', function(data) {
        var pass = data.password || '';
        if (!adminCheckPassword(pass)) {
            socket.emit('adminResult', {
                status: 'error',
                message: '❌ Sai mật khẩu admin!'
            });
            return;
        }
        var user = data.user;
        var amount = parseMoney(data.amount) || 0;
        var found = false;
        for (var id in players) {
            if (players[id].name === user || id === user) {
                players[id].balance += amount;
                found = true;
                io.to(id).emit('balanceUpdate', {
                    balance: players[id].balance
                });
                break;
            }
        }
        if (!found) {
            socket.emit('adminResult', {
                status: 'error',
                message: '❌ Không tìm thấy người chơi!'
            });
            return;
        }
        socket.emit('adminResult', {
            status: 'success',
            message: '✅ Đã cộng ' + amount.toLocaleString() + ' coins cho ' + user
        });
        io.sockets.emit('adminPlayerList', {
            players: getPlayersList()
        });
    });

    socket.on('adminSubBalance', function(data) {
        var pass = data.password || '';
        if (!adminCheckPassword(pass)) {
            socket.emit('adminResult', {
                status: 'error',
                message: '❌ Sai mật khẩu admin!'
            });
            return;
        }
        var user = data.user;
        var amount = parseMoney(data.amount) || 0;
        var found = false;
        for (var id in players) {
            if (players[id].name === user || id === user) {
                players[id].balance = Math.max(0, players[id].balance - amount);
                found = true;
                io.to(id).emit('balanceUpdate', {
                    balance: players[id].balance
                });
                break;
            }
        }
        if (!found) {
            socket.emit('adminResult', {
                status: 'error',
                message: '❌ Không tìm thấy người chơi!'
            });
            return;
        }
        socket.emit('adminResult', {
            status: 'success',
            message: '✅ Đã trừ ' + amount.toLocaleString() + ' coins của ' + user
        });
        io.sockets.emit('adminPlayerList', {
            players: getPlayersList()
        });
    });

    socket.on('adminResetBalance', function(data) {
        var pass = data.password || '';
        if (!adminCheckPassword(pass)) {
            socket.emit('adminResult', {
                status: 'error',
                message: '❌ Sai mật khẩu admin!'
            });
            return;
        }
        var user = data.user;
        var found = false;
        for (var id in players) {
            if (players[id].name === user || id === user) {
                players[id].balance = 0;
                found = true;
                io.to(id).emit('balanceUpdate', {
                    balance: players[id].balance
                });
                break;
            }
        }
        if (!found) {
            socket.emit('adminResult', {
                status: 'error',
                message: '❌ Không tìm thấy người chơi!'
            });
            return;
        }
        socket.emit('adminResult', {
            status: 'success',
            message: '✅ Đã reset ' + user + ' về 0 coins'
        });
        io.sockets.emit('adminPlayerList', {
            players: getPlayersList()
        });
    });

    socket.on('adminForceResult', function(data) {
        var pass = data.password || '';
        if (!adminCheckPassword(pass)) {
            socket.emit('adminResult', {
                status: 'error',
                message: '❌ Sai mật khẩu admin!'
            });
            return;
        }
        var force = data.result || '';
        global.forceResult = force;
        socket.emit('adminResult', {
            status: 'success',
            message: force ? '🎯 Đã force kết quả: ' + force.toUpperCase() : '🎲 Đã hủy force'
        });
    });

    socket.on('disconnect', function () {
        console.log('🔴 Người chơi ngắt kết nối: ' + socket.id);
    });
});

// ===================== BẮT ĐẦU GAME =====================
tx.gameStart();

console.log('🚀 Server đã sẵn sàng!');
console.log('⏱️ Thời gian đặt cược: 40s');
console.log('📊 Lịch sử sẽ được lưu để soi cầu');
console.log('🔐 Admin mật khẩu: admin123');
console.log('💡 Hỗ trợ nhập tiền: 100k = 100.000, 1m = 1.000.000');
console.log('💰 Tiền thưởng chỉ được tính SAU KHI NẶN (kéo bát)');