// 설치한 모듈을 불러오는 코드

const express = require('express');
const mysql = require('mysql');
const app = express()
const port = 3000
const bodyParser = require('body-parser')
const session = require('express-session');

const conn = { // mysql 접속 설정, 데이터베이스 연결
  host: '127.0.0.1',
  port: 3306,
  user: 'root',
  password: 'root',
  database: '게시판',
};

// HTML 파일을 EJS 템플릿으로 렌더링하기 위한 엔진 설정
// @ts-ignore
app.engine('html', require('ejs').renderFile);

// Express 애플리케이션의 템플릿 엔진을 EJS로 설정
app.set('view engine', 'ejs');


// 미들웨어 설정: 클라이언트 요청과 서버 응답 사이에서 동작하는 함수
app.use(bodyParser.urlencoded({ extended: true  }))
app.use(bodyParser.json());



// 세션 설정
app.use(session({
  secret: 'your_secret_key',
  resave: false,
  saveUninitialized: true
}));

// 세션 미들웨어 설정
const requireLogin = (req, res, next) => {
  if (!req.session || !req.session.user) {
    res.redirect('/login'); // 로그인 페이지로 리디렉션
  } else {
    console.log('Session:', req.session);
    next(); // 다음 미들웨어로 이동
  }
};

// 연결되었는지 확인
let connection = mysql.createConnection(conn);
connection.connect((err) => {
  if (err) {
    console.error('Error connecting to database:', err);
    return;
  }
  console.log('Connected to database');
});

// @ts-ignore
app.get('/', (req, res) => {
  res.render('index.html')
})


// 게시판 목록 가져오기
app.get('/list', requireLogin, (req, res) => {
  const page = req.query.page || 1; // 요청된 페이지, 기본값은 1
  const limit = 5; // 페이지당 보여줄 게시물 수
  const offset = (+page - 1) * limit; // 데이터베이스에서 가져올 시작 인덱스
  
  let query = 'SELECT * FROM board ORDER BY board_idx DESC LIMIT ? OFFSET ?';
  let params = [limit, offset];

  // @ts-ignore
  connection.query(query, params, (error, results, fields) => {
    if (error) {
      console.error('Error fetching posts:', error);
      // @ts-ignore
      res.status(500).json({ message: 'Error fetching posts' });
      return;
    }
    
    // 전체 게시물 수 가져오기
    connection.query('SELECT COUNT(*) AS totalCount FROM board', (err, countResult) => {
      if (err) {
        console.error('Error fetching total post count:', err);
        // @ts-ignore
        res.status(500).json({ message: 'Error fetching total post count' });
        return;
      }
      
      const totalCount = countResult[0].totalCount;
      const totalPages = Math.ceil(totalCount / limit); // 총 페이지 수 계산
      res.render('list', { 'data': results, 'currentPage': page, 'totalPages': totalPages });
    });
  });
});

// 리스트에서 삭제 버튼 누를 시, 게시글 삭제
app.get('/writeDelete', (req, res) => {
  const boardId = req.query.board_idx ; // 댓글 ID
  const userId = req.session.user; // 현재 로그인된 사용자의 ID

  // 게시글 찾기 SQL 쿼리
  const query = 'SELECT * FROM board WHERE board_idx = ?';
  connection.query(query, [boardId], (err, results) => {
    if (err) {
      console.error('Error finding comment:', err);
      // @ts-ignore
      res.status(500).json({ message: 'Error finding comment' });
      return;
    }

    // 게시글이 존재하지 않는 경우
    const board = results[0]; // 결과 배열의 첫 번째 요소를 가져옴
    if (!board) {
      // @ts-ignore
      res.status(404).json({ message: 'Comment not found' });
      return;
    }

    // 게시글의 소유자가 아닌 경우
    if (board.user_id !== userId) {
      res.send(`<script>alert('삭제 권한이 없습니다.'); window.location.href='/list';</script>`);
      return;
    }

    // 게시글 삭제 SQL 쿼리
    const deleteQuery = 'DELETE FROM board WHERE board_idx = ?';
    // @ts-ignore
    connection.query(deleteQuery, [boardId], (err, results) => {
      if (err) {
        console.error('Error deleting comment:', err);
        // @ts-ignore
        res.status(500).json({ message: 'Error deleting comment' });
        return;
      }
      res.send(`<script>alert('삭제되었습니다.'); location.href='/list';</script>`);
    });
  });
});

// 게시물 작성
// @ts-ignore
app.get('/write', (req, res) => {
  res.render('write', { title: "게시판 글 쓰기" })
})


// 게시물 작성 - 데이터베이스에 데이터 삽입
app.post('/writeProc', (req, res) => {
  // @ts-ignore
  const subject = req.body.subject;
  // @ts-ignore
  const writer = req.body.writer;
  // @ts-ignore
  const content = req.body.content;
  const userId = req.session.user;

  var sql = `insert into board(board_title, board_writer, board_content, board_regdate, user_id) values(?,?,?,now(),?)`;
  var values = [subject, writer, content, userId];
  
  // 데이터 삽입
  // @ts-ignore
  connection.query(sql, values, function (err, result) {
    if (err) {
      console.error('Error inserting data:', err);
      res.status(500).send('Error inserting data');
      return;
    }console.log('Data inserted successfully');
    
    // 새로운 게시글이 등록된 후에 해당 게시글의 ID를 가져옵니다.
    connection.query('SELECT LAST_INSERT_ID() as lastId', function(err, results) {
      if(err) {
        console.error('Error fetching last insert id:', err);
        res.status(500).send('Error fetching last insert id');
        return;
      }
      // 가져온 ID를 클라이언트로 전송하여 리다이렉트합니다.
      const newlyInsertedId = results[0].lastId;
      res.send(`<script>alert('게시물이 등록되었습니다.'); window.location.href='/view?board_idx=${newlyInsertedId}';</script>`);
    });
  });
});



// 게시물 상세보기
app.get('/view', (req, res) => {
  const sql = `SELECT * FROM board WHERE board_idx = ?`;   // 실행할 SQL 쿼리
  const idx = req.query.board_idx;   // 쿼리에 전달할 매개변수
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
    } const boardData = results[0]; // 첫 번째 결과를 사용

    // 조회수 증가
    // 실행할 SQL 쿼리
    const updateViewsSql = `UPDATE board SET board_views = board_views + 1 WHERE board_idx = ?`; 
    // 쿼리에 전달할 매개변수
    const idx = req.query.board_idx;   
    // @ts-ignore
    connection.query(updateViewsSql, [idx], (err, updateResult) => {
      if (err) {
        console.error('Error updating views:', err);
        return res.status(500).send('조회수 업데이트 중 오류가 발생했습니다.');
      }

      // 게시물에 대한 댓글 데이터 가져오기
      const idx = req.query.board_idx;
      const sql = `
        SELECT *, ROW_NUMBER() OVER (PARTITION BY board_idx ORDER BY comment_idx) AS row_num
        FROM comment
        WHERE board_idx = ?
      `;

      connection.query(sql, [idx], (error, commentResults) => {
      if (error) {
        console.error('Error fetching comment data:', error);
        return res.status(500).send('Error fetching comment data');
      }
      
      // 댓글 데이터를 렌더링할 때 템플릿에 전달
      res.render('view', { data: boardData, comments: commentResults })
        });
      });
    });
  });


// 상세보기에서 삭제 버튼 누를 시, 게시글 삭제
app.post('/viewDelete', (req, res) => {
  const boardId = req.query.board_idx; // 댓글 ID
  const userId = req.session.user; // 현재 로그인된 사용자의 ID

  // 게시물이 찾기 SQL 쿼리
  const query = 'SELECT * FROM board WHERE board_idx = ?';
  connection.query(query, [boardId], (err, results) => {
    if (err) {
      console.error('Error finding comment:', err);
      // @ts-ignore
      res.status(500).json({ message: 'Error finding comment' });
      return;
    } const board = results[0]; // 결과 배열의 첫 번째 요소를 가져옴

    // 게시물이 존재하지 않는 경우
    if (!board) {
      // @ts-ignore
      res.status(404).json({ message: 'Comment not found' });
      return;
    }

    // 게시물이의 소유자가 아닌 경우
    if (board.user_id !== userId) {
      res.send(`<script>alert('삭제 권한이 없습니다.'); window.location.href='/list';</script>`);
      return;
    }

    // 게시물이 삭제 SQL 쿼리
    const deleteQuery = 'DELETE FROM board WHERE board_idx = ?';
    // @ts-ignore
    connection.query(deleteQuery, [boardId], (err, results) => {
      if (err) {
        console.error('Error deleting comment:', err);
        // @ts-ignore
        res.status(500).json({ message: 'Error deleting comment' });
        return;
      }
      res.send(`<script>alert('삭제되었습니다.'); location.href='/list';</script>`);
    });
  });
});

// 댓글 삭제
app.post('/commentDelete', requireLogin, (req, res) => {
  const commentId = req.query.comment_idx ; // 댓글 ID
  const userId = req.session.user; // 현재 로그인된 사용자의 ID

  // 댓글 찾기 SQL 쿼리
  const query = 'SELECT * FROM comment WHERE comment_idx = ?';
  connection.query(query, [commentId], (err, results) => {
    if (err) {
      console.error('Error finding comment:', err);
      // @ts-ignore
      res.status(500).json({ message: 'Error finding comment' });
      return;
    }

    // 댓글이 존재하지 않는 경우
    const comment = results[0]; // 결과 배열의 첫 번째 요소를 가져옴
    if (!comment) {
      // @ts-ignore
      res.status(404).json({ message: 'Comment not found' });
      return;
    }

    // 댓글의 소유자가 아닌 경우
    if (comment.user_id !== userId) {
      res.send(`<script>alert('삭제 권한이 없습니다.'); window.location.href='/list';</script>`);
      return;
    }

    // 댓글 삭제 SQL 쿼리
    const deleteQuery = 'DELETE FROM comment WHERE comment_idx = ?';
    // @ts-ignore
    connection.query(deleteQuery, [commentId], (err, results) => {
      if (err) {
        console.error('Error deleting comment:', err);
        // @ts-ignore
        res.status(500).json({ message: 'Error deleting comment' });
        return;
      }
      res.send(`<script>alert('삭제되었습니다.'); location.href='/list';</script>`);
    });
  });
});

app.post('/like', requireLogin, (req, res) => {
  const userId = req.session.user; // 세션에서 사용자 ID 가져오기
  const boardId = req.query.board_idx;

  // 좋아요를 누른 기록이 있는지 확인하는 쿼리
  const query = 'SELECT * FROM likes WHERE user_id = ? AND board_idx = ?';
  connection.query(query, [userId, boardId], (err, results) => {
    if (err) {
      console.error('Error checking like:', err);
      res.status(500).send('Error checking like');
      return;
    }

    if (results.length > 0) { // 이미 좋아요를 누른 경우
      console.log('Duplicate like');
      res.send(`<script>alert('이미 좋아요를 누르셨습니다.'); window.location.href='/list';</script>`);
    } else { // 좋아요를 누르지 않은 경우
      // 좋아요를 기록하는 쿼리 실행
      const insertQuery = 'INSERT INTO likes (user_id, board_idx) VALUES (?, ?)';
      // @ts-ignore
      connection.query(insertQuery, [userId, boardId], (err, results) => {
        if (err) {
          console.error('Error inserting like:', err);
          res.status(500).send('Error inserting like');
          return;
        } console.log('Like recorded successfully');
      }); 
          var idx = req.query.board_idx;
          var sql =`UPDATE board SET board_like = board_like + 1 WHERE board_idx = ?`;
            // @ts-ignore
            connection.query(sql, [idx], function (err, results) {
            if (err) {
            console.error('Error deleting post:', err);
            // @ts-ignore
            res.status(500).json({ message: 'Error deleting post' });
            return;
            }
            console.log('Likes updated successfully');
            res.send(`<script>alert('좋아요를 누르셨습니다.'); location.href='list';</script>`);
          });
        }
    });
});


// 게시물 수정 - 수정 전 데이터 가져오기
app.post('/modify', (req, res) => {
  const idx = req.query.board_idx;
  const userId = req.session.user; // 현재 로그인된 사용자의 ID

  // 수정 전 데이터를 가져오기
  const selectSql = `SELECT * FROM board WHERE board_idx = ?`;
  connection.query(selectSql, [idx], (err, results) => {
    // 댓글의 소유자가 아닌 경우
    const board = results[0]; // 결과 배열의 첫 번째 요소를 가져옴
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
      res.send(`<script>alert('수정 권한이 없습니다.'); window.location.href='/list';</script>`);
      return;
    }

    console.log('modify access successfully');
    const boardData = results[0]; // 첫 번째 결과를 사용
    res.render('modify', { 'data': boardData });
    
})

  // 게시물 수정 
app.post('/modifyProc', (req, res) => {
  const idx = req.query.board_idx;
  // @ts-ignore
  const newTitle = req.body.subject;
  // @ts-ignore
  const newWriter = req.body.writer;
  // @ts-ignore
  const newContent = req.body.content;
  

  // 데이터 수정
  const updateSql = `UPDATE board SET board_title = ?, board_writer = ?, board_content = ? WHERE board_idx = ?`;
  connection.query(updateSql, [newTitle, newWriter, newContent, idx], (err, updateResult) => {
    if (err) {
      console.error('Error updating data:', err);
      // @ts-ignore
      res.status(500).json({ message: 'Error updating data' });
      return;
    } if (updateResult.affectedRows == 0) {
      console.error('No modified data found');
      // @ts-ignore
      res.status(404).json({ message: 'No modified data found' });
      return;
    } console.log('Data updated successfully');
    

    // 수정된 데이터를 가져온 후 수정된 view 페이지 가져오기
    const modifiedDataSql = `SELECT * FROM board WHERE board_idx = ?`;
    connection.query(modifiedDataSql, [idx], (err, modifiedResults) => {
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
      const boardData = modifiedResults[0]; // 첫 번째 결과를 사용
      // res.render('view', { 'data': boardData });
      res.redirect(`/view?board_idx=${idx}`);
        });
      });
    });
  });

  // 댓글 달기
app.post('/comment', (req, res) => {
  const userId = req.session.user;
  // @ts-ignore
  const content = req.body.content;
  const boardId = req.query.board_idx;
  var sql = `INSERT INTO comment(user_id, comment, board_idx, row_num) 
  SELECT ?, ?, ?, IFNULL(MAX(row_num), 0) + 1 FROM comment WHERE board_idx = ?`;
  var values = [userId, content, boardId, boardId];
  
  // 데이터 삽입
  // @ts-ignore
  connection.query(sql, values, function (err, result) {
    if (err) {
      console.error('Error inserting data:', err);
      res.status(500).send('Error inserting data');
      return;
    } console.log('Data inserted successfully');

    // view 페이지 가져오기
    const idx = req.query.board_idx;
    const modifiedDataSql = `SELECT * FROM board WHERE board_idx = ?`;
    connection.query(modifiedDataSql, [idx], (err, modifiedResults) => {
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
      const boardData = modifiedResults[0]; // 첫 번째 결과를 사용
      // res.send("<script> alert('등록되었습니다.'); location.href='/list';</script>");
      res.redirect(`/view?board_idx=${boardId}`);
        });
    });
});



// app.get('/board', requireLogin, (req, res) => {
//   // 게시판 페이지를 보여주는 라우트 핸들러
// });

// 회원가입
app.post('/join', (req, res) => {
  // @ts-ignore
  const id = req.body.id;
  // @ts-ignore
  const pw = req.body.password;
  const idx = [id, pw]
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
      res.send(`<script>alert('이미 등록된 아이디입니다.'); window.location.href='/list';</script>`);
    } else {
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
        res.send(`<script>alert('회원가입이 완료되었습니다.'); window.location.href='/login';</script>`);
      });
    }
  });
});


// 로그인 페이지 렌더링
// @ts-ignore
app.get('/login', (req, res) => {
  res.render('login', { title: "로그인" })
})


// 로그인 처리
app.post('/login', (req, res) => {
  // @ts-ignore
  const id = req.body.id;
  // @ts-ignore
  const pw = req.body.password;
  const idx = [id, pw]

  // 아이디와 비밀번호를 확인하는 쿼리 실행
  const query = 'SELECT * FROM users WHERE user_id = ? AND user_pw = ?';
  connection.query(query, idx, (err, rows) => {
    if (err) {
      console.error('Error fetching user:', err);
      res.status(500).send('Error fetching user');
      return;
    }

    if (rows.length > 0) { // 로그인 성공
      console.log('로그인 성공');
      req.session.user = id; // 세션에 사용자 ID 저장
      res.redirect('/list'); // 게시판 목록 페이지로 리디렉션
    } else { // 로그인 실패
      res.send(`<script>alert('아이디 또는 비밀번호가 올바르지 않습니다.'); window.location.href='/list';</script>`);
    }
  });
});   



// 로그아웃 처리
// app.get('/logout', (req, res) => {
//   req.session.destroy(); // 세션 제거
//   res.redirect('/login'); // 로그인 페이지로 리디렉션
// });

// 서버 가동
app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
});

