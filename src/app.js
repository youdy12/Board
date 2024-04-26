"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var express = require("express");
var cors = require('cors')
var mysql = require("mysql");
var app = express();
var port = 3000;
var bodyParser = require("body-parser");
var session = require("express-session");
var path = require("path");
var publicPath = path.join(__dirname, "files");
var multer = require("multer");
const { v4: uuidv4 } = require('uuid');

// require('dotenv').config();

console.log('APP_URL:', process.env.APP_URL);

const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, `../.env.${process.env.NODE_ENV}`) })
// console.log(document)
console.log('path', path.join(__dirname, `../.env.${process.env.NODE_ENV}`))
console.log('process.env', process.env)

// console.log('process.env', process.env)/
var conn = {
    host: 'svc.sel5.cloudtype.app',
    port: 31190,
    user: 'root',
    password: 'root',
    database: '게시판',
};
// @ts-ignore
app.all('/*', function (req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "X-Requested-With");
    next();
});

// HTML 파일을 EJS 템플릿으로 렌더링하기 위한 엔진 설정
app.engine('html', require('ejs').renderFile);
// Express 애플리케이션의 템플릿 엔진을 EJS로 설정
app.set('view engine', 'ejs');
// 미들웨어 설정: 클라이언트 요청과 서버 응답 사이에서 동작하는 함수
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(publicPath));
// app.use('/css', express.static(path.join(__dirname, 'static')));
app.use(cors())
app.set('views', path.join(__dirname, 'views'));
// 세션 설정
app.use(session({
    secret: 'your_secret_key',
    resave: false,
    saveUninitialized: true
}));
// 미들웨어: 사용자 인증 및 권한 확인
var requireLogin = function (req, res, next) {
    if (!req.session || !req.session.user) {
        res.send("<script>alert('\uB85C\uADF8\uC778 \uD6C4 \uC774\uC6A9\uD558\uC138\uC694.'); window.location.href='/login';</script>");
    }
    else {
        next(); // 다음 미들웨어로 이동
    }
};
// 연결되었는지 확인
var connection = mysql.createConnection(conn);
connection.connect(function (err) {
    if (err) {
        console.error('Error connecting to database:', err);
        return;
    }
    console.log('Connected to database');
});
// @ts-ignore
app.get('/', function (req, res) {
    res.render('index.html');
});
// 게시판 목록 가져오기
app.get('/list', function (req, res) {
    // @ts-ignore
    var page = parseInt(req.query.page) || 1; // 요청된 페이지, 기본값은 1
    var limit = 10; // 페이지당 보여줄 게시물 수
    var offset = (page - 1) * limit; // 데이터베이스에서 가져올 시작 인덱스
    var sortBy = req.query.sortBy || 'board_idx DESC'; // 정렬 기본값 = 내림차순
    var query = 'SELECT * FROM board';
    var countQuery = 'SELECT COUNT(*) AS totalCount FROM board';
    var params = [];
    // 세션에 검색어 저장
    var searchQuery = req.query.query || '';
    // @ts-ignore
    req.session.searchQuery = searchQuery;
    // 검색어에 따라 쿼리 조건 설정
    if (searchQuery) {
        if (req.query.sortBy === 'board_title') {
            query += ' WHERE board_title LIKE ?';
            countQuery += ' WHERE board_title LIKE ?';
            // @ts-ignore
            params.push("%".concat(searchQuery, "%"));
        }
        else if (req.query.sortBy === 'board_content') {
            query += ' WHERE board_content LIKE ?';
            countQuery += ' WHERE board_content LIKE ?';
            // @ts-ignore
            params.push("%".concat(searchQuery, "%"));
        }
        else if (req.query.sortBy === 'user_id') {
            query += ' WHERE user_id LIKE ?';
            countQuery += ' WHERE user_id LIKE ?';
            // @ts-ignore
            params.push("%".concat(searchQuery, "%"));
        }
        else if (req.query.sortBy === 'board_idx') {
            query += ' WHERE board_content LIKE ? OR board_title LIKE ?';
            countQuery += ' WHERE board_content LIKE ? OR board_title LIKE ?';
            // @ts-ignore
            params.push("%".concat(searchQuery, "%"), "%".concat(searchQuery, "%"));
        }
        else {
            // 기본 정렬 옵션은 게시물 번호 내림차순
            query += ' WHERE board_title LIKE ?';
            countQuery += ' WHERE board_title LIKE ?';
            // @ts-ignore
            params.push("%".concat(searchQuery, "%"));
        }
    }
    // 정렬 기능 처리
    if (sortBy === 'title-asc') {
        query += ' ORDER BY board_title ASC';
    }
    else if (sortBy === 'title-desc') {
        query += ' ORDER BY board_title DESC';
    }
    else if (sortBy === 'likes-asc') {
        query += ' ORDER BY board_like DESC';
    }
    else if (sortBy === 'views-desc') {
        query += ' ORDER BY board_views DESC';
    }
    else if (sortBy === 'regdate-desc') {
        query += ' ORDER BY board_regdate DESC';
    }
    else {
        // 기본 정렬 옵션은 게시물 번호 내림차순
        query += ' ORDER BY ' + sortBy;
    }
    query += ' LIMIT ? OFFSET ?';
    params.push(limit, offset);
    // @ts-ignore
    connection.query(query, params, function (error, results, fields) {
        if (error) {
            console.error('Error fetching posts:', error);
            // @ts-ignore
            res.status(500).json({ message: 'Error fetching posts' });
            return;
        }
        // console.log(results);
        // 전체 게시물 수 가져오기
        connection.query(countQuery, params, function (error, countResult) {
            if (error) {
                console.error('Error fetching total post count:', error);
                // @ts-ignore
                res.status(500).json({ message: 'Error fetching total post count' });
                return;
            }
            var totalCount = countResult[0].totalCount;
            var totalPages = Math.ceil(totalCount / limit); // 총 페이지 수 계산
            var currentPage = page;
            // res.json({
            //   data:
            //   results,
            //   currentPage,
            //   totalPages,
            //   searchQuery,
            // 검색어 및 페이지 정보 전달
            res.render('list', {
                data: results,
                currentPage: currentPage,
                totalPages: totalPages,
                searchQuery: searchQuery,
                sortBy: sortBy
            });
        });
    });
});
// 리스트에서 삭제 버튼 누를 시, 게시글 삭제
app.get('/writeDelete', function (req, res) {
    var boardId = req.query.board_idx; // 댓글 ID
    var userId = req.session.user; // 현재 로그인된 사용자의 ID
    // 게시글 찾기 SQL 쿼리
    var query = 'SELECT * FROM board WHERE board_idx = ?';
    connection.query(query, [boardId], function (err, results) {
        if (err) {
            console.error('Error finding comment:', err);
            // @ts-ignore
            res.status(500).json({ message: 'Error finding comment' });
            return;
        }
        // 게시글이 존재하지 않는 경우
        var board = results[0]; // 결과 배열의 첫 번째 요소를 가져옴
        if (!board) {
            // @ts-ignore
            res.status(404).json({ message: 'Comment not found' });
            return;
        }
        // 게시글의 소유자가 아닌 경우
        if (board.user_id !== userId) {
            res.send("<script>alert('\uC0AD\uC81C \uAD8C\uD55C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.'); window.location.href='/list';</script>");
            return;
        }
        // 게시글 삭제 SQL 쿼리
        var deleteQuery = 'DELETE FROM board WHERE board_idx = ?';
        // @ts-ignore
        connection.query(deleteQuery, [boardId], function (err, results) {
            if (err) {
                console.error('Error deleting comment:', err);
                // @ts-ignore
                res.status(500).json({ message: 'Error deleting comment' });
                return;
            }
            res.send("<script>alert('\uC0AD\uC81C\uB418\uC5C8\uC2B5\uB2C8\uB2E4.'); location.href='/list';</script>");
        });
    });
});
// 게시물 작성
// @ts-ignore
app.get('/write', requireLogin, function (req, res) {
    res.render('write', { title: "게시판 글 쓰기" });
});

const randomID = uuidv4();
var storage = multer.diskStorage({
    // @ts-ignore
    
    destination: function (req, file, done) {
        done(null, path.join(__dirname, 'files')); // 파일 저장 경로 여기요 넵
    }, // 이걸 상대경로에 맞게 설정을 해야됩니다
    
    // @ts-ignore
    filename: function (req, file, done) {
        // @ts-ignore
        const randomID = uuidv4();
        var ext = path.extname(file.originalname); // 파일 이름
        var basename = path.basename(file.originalname, ext);
        done(null, basename + '_' + new Date().getTime() + ext);
    }
});
var upload = multer({ storage: storage });
app.post('/writeProc', upload.array('myFiles', 5), function (req, res) {
    var subject = req.body.subject;
    var content = req.body.content;
    var userId = req.session.user;
    var files = req.files;
    // console.log('files', files)
    // Check if files were uploaded
    if (!files || files.length === 0) {
        return res.status(400).send('No files uploaded');
    }
    // Process uploaded files (extract filenames)
    // @ts-ignore
    var imageUrls = files.map(function (file) {
        return file.filename; // Assuming file.filename contains the generated filename
    });
    var imageUrlString = imageUrls.join(',');
    var sql = "INSERT INTO board (board_title, board_content, board_regdate, user_id, board_image) VALUES (?, ?, NOW(), ?, ?)";
    var values = [subject, content, userId, imageUrlString];
    // @ts-ignore
    connection.query(sql, values, function (err, result) {
        if (err) {
            console.error('Error inserting data:', err);
            return res.status(500).send('Error inserting data');
        }
        console.log('Data inserted successfully');
        if (Array.isArray(req.body.image)) {
            console.log(req.file);
        }
        // 새로운 게시글이 등록된 후에 해당 게시글의 ID를 가져옵니다.
        connection.query('SELECT LAST_INSERT_ID() as lastId', function (err, results) {
            if (err) {
                console.error('Error fetching last insert id:', err);
                return res.status(500).send('Error fetching last insert id');
            }
            // 가져온 ID를 클라이언트로 전송하여 리다이렉트합니다.
            var newlyInsertedId = results[0].lastId;
            res.send("<script>alert('\uAC8C\uC2DC\uBB3C\uC774 \uB4F1\uB85D\uB418\uC5C8\uC2B5\uB2C8\uB2E4.'); window.location.href='/view?board_idx=".concat(newlyInsertedId, "';</script>"));
        });
    });
});
// 게시물 상세보기
app.get('/view', function (req, res) {
    var sql = "SELECT * FROM board WHERE board_idx = ?"; // 실행할 SQL 쿼리
    var idx = req.query.board_idx; // 쿼리에 전달할 매개변수
    connection.query(sql, [idx], function (error, results) {
        // 오류 났을 경우
        if (error) {
            console.error('데이터베이스 쿼리 오류:', error);
            return res.status(500).send('게시글을 불러오는 중 오류가 발생했습니다.');
        }
        // 조회 결과가 없을 경우
        if (results.length === 0) {
            console.error('No data found');
            res.status(404).send('Not Found');
            return;
        }
        var boardData = results[0]; // 첫 번째 결과를 사용
        var imageUrl = boardData.board_image.toString().split(',');
        // console.log(imageUrl);
        // console.log("🚀 ~ imageUrl:", imageUrl)
        // 조회수 증가
        // 실행할 SQL 쿼리
        var updateViewsSql = "UPDATE board SET board_views = board_views + 1 WHERE board_idx = ?";
        // 쿼리에 전달할 매개변수
        var idx = req.query.board_idx;
        // @ts-ignore
        connection.query(updateViewsSql, [idx], function (err, updateResult) {
            if (err) {
                console.error('Error updating views:', err);
                return res.status(500).send('조회수 업데이트 중 오류가 발생했습니다.');
            }
            // 게시물에 대한 댓글 데이터 가져오기
            var idx = req.query.board_idx;
            var sql = "\n        SELECT *, ROW_NUMBER() OVER (PARTITION BY board_idx ORDER BY comment_idx) AS row_num\n        FROM comment WHERE board_idx = ?";
            connection.query(sql, [idx], function (error, commentResults) {
                if (error) {
                    console.error('Error fetching comment data:', error);
                    return res.status(500).send('Error fetching comment data');
                }
                // 댓글 데이터를 렌더링할 때 템플릿에 전달
                res.render('view', { data: boardData, comments: commentResults, imageUrl: imageUrl });
                // res.json({ data: boardData, comments: commentResults, imageUrl: imageUrl })
            });
        });
    });
});
// 상세보기에서 삭제 버튼 누를 시, 게시글 삭제
app.post('/viewDelete', function (req, res) {
    var boardId = req.query.board_idx; // 댓글 ID
    var userId = req.session.user; // 현재 로그인된 사용자의 ID
    // 게시물이 찾기 SQL 쿼리
    var query = 'SELECT * FROM board WHERE board_idx = ?';
    connection.query(query, [boardId], function (err, results) {
        if (err) {
            console.error('Error finding comment:', err);
            // @ts-ignore
            res.status(500).json({ message: 'Error finding comment' });
            return;
        }
        var board = results[0]; // 결과 배열의 첫 번째 요소를 가져옴
        // 게시물이 존재하지 않는 경우
        if (!board) {
            // @ts-ignore
            res.status(404).json({ message: 'Comment not found' });
            return;
        }
        // 게시물이의 소유자가 아닌 경우
        if (board.user_id !== userId) {
            res.send("<script>alert('\uC0AD\uC81C \uAD8C\uD55C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.'); window.location.href='/list';</script>");
            return;
        }
        // 게시물이 삭제 SQL 쿼리
        var deleteQuery = 'DELETE FROM board WHERE board_idx = ?';
        // @ts-ignore
        connection.query(deleteQuery, [boardId], function (err, results) {
            if (err) {
                console.error('Error deleting comment:', err);
                // @ts-ignore
                res.status(500).json({ message: 'Error deleting comment' });
                return;
            }
            res.send("<script>alert('\uC0AD\uC81C\uB418\uC5C8\uC2B5\uB2C8\uB2E4.'); location.href='/list';</script>");
        });
    });
});
// 댓글 삭제
app.post('/commentDelete', requireLogin, function (req, res) {
    var userId = req.session.user; // 현재 로그인된 사용자의 ID
    // @ts-ignore
    var boardIdx = req.body.board_idx;
    // @ts-ignore
    var commentIdx = req.body.comment_idx;
    // 댓글 찾기 SQL 쿼리
    var query = 'SELECT * FROM comment WHERE comment_idx = ?';
    connection.query(query, [commentIdx], function (err, results) {
        if (err) {
            console.error('Error finding comment:', err);
            // @ts-ignore
            res.status(500).json({ message: 'Error finding comment' });
            return;
        }
        // 댓글이 존재하지 않는 경우
        var comment = results[0]; // 결과 배열의 첫 번째 요소를 가져옴
        if (!comment) {
            // @ts-ignore
            res.status(404).json({ message: 'Comment not found' });
            return;
        }
        // 댓글의 소유자가 아닌 경우
        if (comment.user_id !== userId) {
            res.send("<script>alert('\uC0AD\uC81C \uAD8C\uD55C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.'); window.location.href='/list';</script>");
            return;
        }
        // 댓글 삭제 SQL 쿼리
        var deleteQuery = 'DELETE FROM comment WHERE comment_idx = ?';
        // @ts-ignore
        connection.query(deleteQuery, [commentIdx], function (err, results) {
            if (err) {
                console.error('Error deleting comment:', err);
                // @ts-ignore
                res.status(500).json({ message: 'Error deleting comment' });
                return;
            }
            // 수정된 데이터를 가져온 후 수정된 view 페이지 가져오기
            var modifiedDataSql = "SELECT * FROM board WHERE board_idx = ?";
            connection.query(modifiedDataSql, [boardIdx], function (err, modifiedResults) {
                if (err) {
                    console.error('Error fetching modified data:', err);
                    // @ts-ignore
                    res.status(500).json({ message: 'Error fetching modified data' });
                    return;
                }
                if (modifiedResults.length === 0) {
                    console.error('No modified data found');
                    // @ts-ignore
                    res.status(404).json({ message: 'No modified data found' });
                    return;
                }
                // @ts-ignore
                var boardData = modifiedResults[0]; // 첫 번째 결과를 사용
                res.redirect("/view?board_idx=".concat(boardIdx));
            });
        });
    });
});
app.post('/like', requireLogin, function (req, res) {
    var userId = req.session.user; // 세션에서 사용자 ID 가져오기
    var boardId = req.query.board_idx;
    // 좋아요를 누른 기록이 있는지 확인하는 쿼리
    var query = 'SELECT * FROM likes WHERE user_id = ? AND board_idx = ?';
    connection.query(query, [userId, boardId], function (err, results) {
        if (err) {
            console.error('Error checking like:', err);
            res.status(500).send('Error checking like');
            return;
        }
        if (results.length > 0) { // 이미 좋아요를 누른 경우
            console.log('Duplicate like');
            var idx = req.query.board_idx;
            // @ts-ignore
            res.send("<script>alert('\uC774\uBBF8 \uC88B\uC544\uC694\uB97C \uB204\uB974\uC168\uC2B5\uB2C8\uB2E4.'); window.location.href='/view?board_idx=".concat(idx, "';</script>"));
        }
        else {
            // 좋아요를 누르지 않은 경우
            // 좋아요를 기록하는 쿼리 실행
            var insertQuery = 'INSERT INTO likes (user_id, board_idx) VALUES (?, ?)';
            // @ts-ignore
            connection.query(insertQuery, [userId, boardId], function (err, results) {
                if (err) {
                    console.error('Error inserting like:', err);
                    res.status(500).send('Error inserting like');
                    return;
                }
                console.log('Like recorded successfully');
            });
            var idx = req.query.board_idx;
            var sql = "UPDATE board SET board_like = board_like + 1 WHERE board_idx = ?";
            // @ts-ignore
            connection.query(sql, [idx], function (err, results) {
                if (err) {
                    console.error('Error deleting post:', err);
                    // @ts-ignore
                    res.status(500).json({ message: 'Error deleting post' });
                    return;
                }
                console.log('Likes updated successfully');
                // 수정된 데이터를 가져온 후 수정된 view 페이지 가져오기
                var modifiedDataSql = "SELECT * FROM board WHERE board_idx = ?";
                connection.query(modifiedDataSql, [boardId], function (err, modifiedResults) {
                    if (err) {
                        console.error('Error fetching modified data:', err);
                        // @ts-ignore
                        res.status(500).json({ message: 'Error fetching modified data' });
                        return;
                    }
                    if (modifiedResults.length === 0) {
                        console.error('No modified data found');
                        // @ts-ignore
                        res.status(404).json({ message: 'No modified data found' });
                        return;
                    }
                    // @ts-ignore
                    var boardData = modifiedResults[0]; // 첫 번째 결과를 사용
                    // res.render('view', { 'data': boardData });
                    // @ts-ignore
                    res.redirect("/view?board_idx=".concat(idx));
                });
            });
        }
    });
});
app.post('/commentlikes', requireLogin, function (req, res) {
    var userId = req.session.user; // 세션에서 사용자 ID 가져오기
    // @ts-ignore
    var boardIdx = req.body.board_idx;
    // @ts-ignore
    var commentIdx = req.body.comment_idx;
    // 좋아요를 누른 기록이 있는지 확인하는 쿼리
    var query = 'SELECT * FROM commentlikes WHERE user_id = ? AND comment_idx = ?';
    connection.query(query, [userId, commentIdx], function (err, results) {
        if (err) {
            console.error('Error checking like:', err);
            res.status(500).send('Error checking like');
            return;
        }
        if (results.length > 0) { // 이미 좋아요를 누른 경우
            console.log('Duplicate like');
            res.send("<script>alert('\uC774\uBBF8 \uC88B\uC544\uC694\uB97C \uB204\uB974\uC168\uC2B5\uB2C8\uB2E4.'); window.location.href='/list';</script>");
        }
        else {
            // 좋아요를 누르지 않은 경우
            // 좋아요를 기록하는 쿼리 실행
            var insertQuery = 'INSERT INTO commentlikes (user_id, comment_idx) VALUES (?, ?)';
            // @ts-ignore
            connection.query(insertQuery, [userId, commentIdx], function (err, results) {
                if (err) {
                    console.error('Error inserting like:', err);
                    res.status(500).send('Error inserting like');
                    return;
                }
                console.log('Like recorded successfully');
            });
            var idx = req.query.comment_idx;
            var sql = "UPDATE comment SET comment_like = comment_like + 1 WHERE comment_idx = ?";
            // @ts-ignore
            connection.query(sql, [idx], function (err, results) {
                if (err) {
                    console.error('Error deleting post:', err);
                    // @ts-ignore
                    res.status(500).json({ message: 'Error deleting post' });
                    return;
                }
                console.log('Likes updated successfully');
                // var idx = req.query.board_idx;
                // 수정된 데이터를 가져온 후 수정된 view 페이지 가져오기
                var modifiedDataSql = "SELECT * FROM board WHERE board_idx = ?";
                connection.query(modifiedDataSql, [boardIdx], function (err, modifiedResults) {
                    if (err) {
                        console.error('Error fetching modified data:', err);
                        // @ts-ignore
                        res.status(500).json({ message: 'Error fetching modified data' });
                        return;
                    }
                    if (modifiedResults.length === 0) {
                        console.error('No modified data found');
                        // @ts-ignore
                        res.status(404).json({ message: 'No modified data found' });
                        return;
                    }
                    // @ts-ignore
                    var boardData = modifiedResults[0]; // 첫 번째 결과를 사용
                    res.redirect("/view?board_idx=".concat(boardIdx));
                });
            });
        }
    });
});
// 게시물 수정 - 수정 전 데이터 가져오기
app.post('/modify', function (req, res) {
    var idx = req.query.board_idx;
    var userId = req.session.user; // 현재 로그인된 사용자의 ID
    // 수정 전 데이터를 가져오기
    var selectSql = "SELECT * FROM board WHERE board_idx = ?";
    connection.query(selectSql, [idx], function (err, results) {
        // 댓글의 소유자가 아닌 경우
        var board = results[0]; // 결과 배열의 첫 번째 요소를 가져옴
        if (err) {
            console.error('Error fetching original data:', err);
            // @ts-ignore
            res.status(500).json({ message: 'Error fetching original data' });
            return;
        }
        if (results.length === 0) {
            console.error('No original data found');
            // @ts-ignore
            res.status(404).json({ message: 'No original data found' });
            return;
        }
        if (board.user_id !== userId) {
            res.send("<script>alert('\uC218\uC815 \uAD8C\uD55C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.'); window.location.href='/list';</script>");
            return;
        }
        console.log('modify access successfully');
        var boardData = results[0]; // 첫 번째 결과를 사용
        res.render('modify', { 'data': boardData });
    });
    // 게시물 수정 
    app.post('/modifyProc', upload.array('myFiles', 5), function (req, res) {
        var idx = req.query.board_idx;
        var newTitle = req.body.subject;
        var newWriter = req.body.writer;
        var newContent = req.body.content;
        var files = req.files;
        // Check if files were uploaded
        if (!files || files.length === 0) {
            return res.status(400).send('No files uploaded');
        }
        // Process uploaded files (extract filenames)
        // @ts-ignore
        var imageUrls = files.map(function (file) {
            return file.filename; // Assuming file.filename contains the generated filename
        });
        var imageUrlString = imageUrls.join(',');
        // 데이터 수정
        var updateSql = "UPDATE board SET board_title = ?, board_writer = ?, board_content = ?,  board_image= ? WHERE board_idx = ?";
        connection.query(updateSql, [newTitle, newWriter, newContent, imageUrlString, idx], function (err, updateResult) {
            if (err) {
                console.error('Error updating data:', err);
                res.status(500).json({ message: 'Error updating data' });
                return;
            }
            if (updateResult.affectedRows == 0) {
                console.error('No modified data found');
                res.status(404).json({ message: 'No modified data found' });
                return;
            }
            console.log('Data updated successfully');
            // console.log("🚀 ~ imageUrl:", imageUrlString)
            // 수정된 데이터를 가져온 후 수정된 view 페이지 가져오기
            var modifiedDataSql = "SELECT * FROM board WHERE board_idx = ?";
            connection.query(modifiedDataSql, [idx], function (err, modifiedResults) {
                if (err) {
                    console.error('Error fetching modified data:', err);
                    res.status(500).json({ message: 'Error fetching modified data' });
                    return;
                }
                if (modifiedResults.length === 0) {
                    console.error('No modified data found');
                    res.status(404).json({ message: 'No modified data found' });
                    return;
                }
                // @ts-ignore
                var boardData = modifiedResults[0]; // 첫 번째 결과를 사용
                // res.render('view', { 'data': boardData });
                // @ts-ignore
                res.redirect("/view?board_idx=".concat(idx));
            });
        });
    });
});
app.post('/commentFrm', function (req, res) {
    // @ts-ignore
    var boardIdx = req.body.board_idx;
    // @ts-ignore
    var commentIdx = req.body.comment_idx;
    // @ts-ignore
    var commentContent = req.body.comment; // 수정된 댓글 내용
    var userId = req.session.user; // 현재 사용자 ID (세션에서 가져옴)
    // 수정 전 데이터를 가져오기
    var selectSql = "SELECT * FROM comment WHERE comment_idx = ?";
    connection.query(selectSql, [commentIdx], function (err, results) {
        if (err) {
            console.error('Error fetching original data:', err);
            // @ts-ignore
            res.status(500).json({ message: 'Error fetching original data' });
            return;
        }
        if (results.length === 0) {
            console.error('No original data found');
            // @ts-ignore
            res.status(404).json({ message: 'No original data found' });
            return;
        }
        var originalComment = results[0];
        // 댓글의 소유자인지 확인
        if (originalComment.user_id !== userId) {
            res.send("<script>alert('\uC218\uC815 \uAD8C\uD55C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.'); window.location.href='/list';</script>");
            return;
        }
        // 데이터 수정
        var updateSql = "UPDATE comment SET comment = ?  WHERE comment_idx = ?";
        connection.query(updateSql, [commentContent, commentIdx], function (err, updateResult) {
            if (err) {
                console.error('Error updating data:', err);
                // @ts-ignore
                res.status(500).json({ message: 'Error updating data' });
                return;
            }
            if (updateResult.affectedRows === 0) {
                console.error('11No modified data found');
                // @ts-ignore
                res.status(404).json({ message: '11No modified data found' });
                return;
            }
            console.log('Comment Data updated successfully');
            // 수정된 데이터를 가져온 후 수정된 view 페이지 가져오기
            var modifiedDataSql = "SELECT * FROM board WHERE board_idx = ?";
            connection.query(modifiedDataSql, [boardIdx], function (err, modifiedResults) {
                if (err) {
                    console.error('Error fetching modified data:', err);
                    // @ts-ignore
                    res.status(500).json({ message: 'Error fetching modified data' });
                    return;
                }
                if (modifiedResults.length === 0) {
                    console.error('No modified data found');
                    // @ts-ignore
                    res.status(404).json({ message: 'No modified data found' });
                    return;
                }
                // @ts-ignore
                var boardData = modifiedResults[0]; // 첫 번째 결과를 사용
                res.redirect("/view?board_idx=".concat(boardIdx));
            });
        });
    });
});
// 댓글 달기
app.post('/comment', function (req, res) {
    var userId = req.session.user;
    // @ts-ignore
    var content = req.body.content;
    var boardId = req.query.board_idx;
    var sql = "INSERT INTO comment(user_id, comment, board_idx, row_num, comment_regdate) \n  SELECT ?, ?, ?, IFNULL(MAX(row_num), 0) + 1, now() FROM comment WHERE board_idx = ?";
    var values = [userId, content, boardId, boardId];
    // 데이터 삽입
    // @ts-ignore
    connection.query(sql, values, function (err, result) {
        if (err) {
            console.error('Error inserting data:', err);
            res.status(500).send('Error inserting data');
            return;
        }
        console.log('Data inserted successfully');
        // view 페이지 가져오기
        var modifiedDataSql = "SELECT * FROM board WHERE board_idx = ?";
        connection.query(modifiedDataSql, [boardId], function (err, modifiedResults) {
            if (err) {
                console.error('Error fetching modified data:', err);
                // @ts-ignore
                res.status(500).json({ message: 'Error fetching modified data' });
                return;
            }
            if (modifiedResults.length === 0) {
                console.error('No modified data found');
                // @ts-ignore
                res.status(404).json({ message: 'No modified data found' });
                return;
            }
            // res.send("<script> alert('등록되었습니다.'); location.href='/list';</script>");
            // @ts-ignore
            res.redirect("/view?board_idx=".concat(boardId));
        });
    });
});
// app.get('/board', requireLogin, (req, res) => {
//   // 게시판 페이지를 보여주는 라우트 핸들러
// });
// 회원가입
app.post('/join', function (req, res) {
    // @ts-ignore
    var id = req.body.id;
    // @ts-ignore
    var pw = req.body.password;
    var idx = [id, pw];
    var checkSql = 'SELECT * FROM users WHERE user_id = ? AND user_pw = ?';
    // Check if the ID already exists
    connection.query(checkSql, idx, function (err, rows) {
        if (err) {
            console.error('Error checking for duplicate ID:', err);
            res.status(500).send('Error checking for duplicate ID');
            return;
        }
        if (rows.length > 0) {
            // If ID already exists, send a message indicating the duplication
            res.send("<script>alert('\uC774\uBBF8 \uB4F1\uB85D\uB41C \uC544\uC774\uB514\uC785\uB2C8\uB2E4.'); window.location.href='/list';</script>");
        }
        else {
            // If ID doesn't exist, proceed with the insertion
            var insertSql = 'INSERT INTO users(user_id, user_pw) VALUES(?,?)';
            // @ts-ignore
            connection.query(insertSql, idx, function (err, result) {
                if (err) {
                    console.error('Error inserting data:', err);
                    res.status(500).send('Error inserting data');
                    return;
                }
                console.log('ID inserted successfully');
                res.send("<script>alert('\uD68C\uC6D0\uAC00\uC785\uC774 \uC644\uB8CC\uB418\uC5C8\uC2B5\uB2C8\uB2E4.'); window.location.href='/login';</script>");
            });
        }
    });
});
// 로그인 페이지 렌더링
// @ts-ignore
app.get('/login', function (req, res) {
    res.render('login', { title: "로그인" });
});
// 로그인 처리
app.post('/login', function (req, res) {
    // @ts-ignore
    var id = req.body.id;
    // @ts-ignore
    var pw = req.body.password;
    var idx = [id, pw];
    // 아이디와 비밀번호를 확인하는 쿼리 실행
    var query = 'SELECT * FROM users WHERE user_id = ? AND user_pw = ?';
    connection.query(query, idx, function (err, rows) {
        if (err) {
            console.error('Error fetching user:', err);
            res.status(500).send('Error fetching user');
            return;
        }
        if (rows.length > 0) { // 로그인 성공
            console.log('로그인 성공');
            req.session.user = id; // 세션에 사용자 ID 저장
            res.redirect('/list'); // 게시판 목록 페이지로 리디렉션
        }
        else { // 로그인 실패
            res.send("<script>alert('\uC544\uC774\uB514 \uB610\uB294 \uBE44\uBC00\uBC88\uD638\uAC00 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.'); window.location.href='/list';</script>");
        }
    });
});
/////////////////////////////////////////////////////////////////////////
// @ts-ignore
app.get('/upload', function (req, res) {
    res.render('upload.ejs');
});
app.post("/upload", upload.single('myFile'), function (req, res) {
    console.log(req.file);
    res.status(200).send("uploaded");
});
// 로그아웃 처리
// app.get('/logout', (req, res) => {
//   req.session.destroy(); // 세션 제거
//   res.redirect('/login'); // 로그인 페이지로 리디렉션
// });
// 서버 가동
app.listen(port, function () {
    // @ts-ignore
    console.log("Example app listening on port ".concat(port));
});
