// 설치한 모듈을 불러오는 코드
import { Request, Response, NextFunction } from 'express';
import express = require('express');
import mysql = require('mysql');
const app = express()
const port = 3000
import bodyParser = require('body-parser');
import session = require('express-session');
import axios from 'axios';
import path = require('path');
const publicPath = path.join(__dirname, "files");
import multer = require('multer');
import uuid4 from 'uuid4';


const conn = { // mysql 접속 설정, 데이터베이스 연결
  host: '127.0.0.1',
  port: 3306,
  user: 'root',
  password: 'root',
  database: '게시판',
};

app.all('/*', function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "X-Requested-With");
  next();
});

// HTML 파일을 EJS 템플릿으로 렌더링하기 위한 엔진 설정
app.engine('html', require('ejs').renderFile);

// Express 애플리케이션의 템플릿 엔진을 EJS로 설정
app.set('view engine', 'ejs');


// 미들웨어 설정: 클라이언트 요청과 서버 응답 사이에서 동작하는 함수
app.use(bodyParser.urlencoded({ extended: true  }))
app.use(bodyParser.json());
app.use(express.static(publicPath));
// app.use('/css', express.static(path.join(__dirname, 'static')));

app.set('views', path.join(__dirname, 'views'));

// 세션 설정
app.use(session({
  secret: 'your_secret_key',
  resave: false,
  saveUninitialized: true
}));


// 미들웨어: 사용자 인증 및 권한 확인
const requireLogin = (req: Request, res: Response, next: NextFunction) => {
    if (!req.session || !req.session.user) {
      res.send(`<script>alert('로그인 후 이용하세요.'); window.location.href='/login';</script>`);
  } else {
    next(); // 다음 미들웨어로 이동
  }
};

// 연결되었는지 확인
let connection = mysql.createConnection(conn);

connection.connect((err: Error) => {
  if (err) {
    console.error('Error connecting to database:', err);
    return;
  }
  console.log('Connected to database');
});

app.get('/', (req: Request, res: Response) => {
  res.render('index.html')
})
// 게시판 목록 가져오기
app.get('/list', (req: Request, res: Response) => {
  const page: number = parseInt(req.query.page as string) || 1; // 요청된 페이지, 기본값은 1
  const limit: number = 10; // 페이지당 보여줄 게시물 수
  const offset: number = (page - 1) * limit; // 데이터베이스에서 가져올 시작 인덱스
  const sortBy: string = req.query.sortBy as string || 'board_idx DESC'; // 정렬 기본값 = 내림차순

  let query = 'SELECT * FROM board';
  let countQuery = 'SELECT COUNT(*) AS totalCount FROM board';
  const params: any[] = [];

  // 세션에 검색어 저장
  const searchQuery: string = req.query.query as string || '';
  req.session.searchQuery = searchQuery;
  
   // 검색어에 따라 쿼리 조건 설정
  if (searchQuery) {
    if (req.query.sortBy === 'board_title') {
      query += ' WHERE board_title LIKE ?';
      countQuery += ' WHERE board_title LIKE ?';
      params.push(`%${searchQuery}%`);
    } else if (req.query.sortBy === 'board_content') {
      query += ' WHERE board_content LIKE ?';
      countQuery += ' WHERE board_content LIKE ?';
      params.push(`%${searchQuery}%`);
    } else if (req.query.sortBy === 'user_id') {
      query += ' WHERE user_id LIKE ?';
      countQuery += ' WHERE user_id LIKE ?';
      params.push(`%${searchQuery}%`);
    } else if (req.query.sortBy === 'board_idx') {
      query += ' WHERE board_content LIKE ? OR board_title LIKE ?';
      countQuery += ' WHERE board_content LIKE ? OR board_title LIKE ?';
      params.push(`%${searchQuery}%`, `%${searchQuery}%`);
    } else {
      // 기본 정렬 옵션은 게시물 번호 내림차순
      query += ' WHERE board_title LIKE ?';
      countQuery += ' WHERE board_title LIKE ?';
      params.push(`%${searchQuery}%`);
    }
  }


  // 정렬 기능 처리
  if (sortBy === 'title-asc') {
    query += ' ORDER BY board_title ASC';
  } else if (sortBy === 'title-desc') {
    query += ' ORDER BY board_title DESC';
  } else if (sortBy === 'likes-asc') {
    query += ' ORDER BY board_like DESC';
  } else if (sortBy === 'views-desc') {
    query += ' ORDER BY board_views DESC';
  } else if (sortBy === 'regdate-desc') {
    query += ' ORDER BY board_regdate DESC';
  } else {
    // 기본 정렬 옵션은 게시물 번호 내림차순
    query += ' ORDER BY ' + sortBy;
  }

  query += ' LIMIT ? OFFSET ?';
  params.push(limit, offset);

  connection.query(query, params, (error: Error | null, results: Response, fields: mysql.FieldInfo[] | undefined) => {
    if (error) {
      console.error('Error fetching posts:', error);
      res.status(500).json({ message: 'Error fetching posts' });

      return;
    }
    // console.log(results);
    // 전체 게시물 수 가져오기
    connection.query(countQuery, params, (error, countResult) => {
      if (error) {
        console.error('Error fetching total post count:', error);
        res.status(500).json({ message: 'Error fetching total post count' });
        return;
      }

      const totalCount = countResult[0].totalCount;
      const totalPages = Math.ceil(totalCount / limit); // 총 페이지 수 계산
      const currentPage = page;

      // res.json({
      //   data:
      //   results,
      //   currentPage,
      //   totalPages,
      //   searchQuery,
      
      // 검색어 및 페이지 정보 전달
      res.render('list', {
        data:
        results,
        currentPage,
        totalPages,
        searchQuery,
        sortBy
        });
      });
    });
  });




// 리스트에서 삭제 버튼 누를 시, 게시글 삭제
app.get('/writeDelete', (req: Request, res: Response)  => {
  const boardId = req.query.board_idx ; // 댓글 ID
  const userId: string = req.session.user; // 현재 로그인된 사용자의 ID

  // 게시글 찾기 SQL 쿼리
  const query = 'SELECT * FROM board WHERE board_idx = ?';
  connection.query(query, [boardId], (err, results) => {
    if (err) {
      console.error('Error finding comment:', err);
      res.status(500).json({ message: 'Error finding comment' });
      return;
    }

    // 게시글이 존재하지 않는 경우
    const board = results[0]; // 결과 배열의 첫 번째 요소를 가져옴
    if (!board) {
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
    connection.query(deleteQuery, [boardId], (err, results) => {
      if (err) {
        console.error('Error deleting comment:', err);
        res.status(500).json({ message: 'Error deleting comment' });
        return;
      }
      res.send(`<script>alert('삭제되었습니다.'); location.href='/list';</script>`);
    });
  });
});

// 게시물 작성
app.get('/write',  requireLogin, (req, res) => {
  res.render('write', { title: "게시판 글 쓰기" })
})

const storage = multer.diskStorage({
  destination: function (req, file, done) {
    done(null, 'files/'); // 파일 저장 경로
  },
  filename: function (req, file, done) {
    const randomID = uuid4();
    const ext =  path.extname(file.originalname);// 파일 이름
    const basename =  path.basename(file.originalname, ext);
    done(null, basename + '_' + new Date().getTime() + ext);
  }
});

const upload = multer({ storage: storage });

app.post('/writeProc', upload.array('myFiles', 5), (req, res) => {
  const subject = req.body.subject;
  const content = req.body.content;
  const userId = req.session.user;

  const files = req.files as Express.Multer.File[];
    
    // Check if files were uploaded
    if (!files || files.length === 0) {
      return res.status(400).send('No files uploaded');
    }
    
    // Process uploaded files (extract filenames)
    const imageUrls: string[] = files.map(file => {
      return file.filename; // Assuming file.filename contains the generated filename
    });
  
  const imageUrlString = imageUrls.join(',');

  const sql = `INSERT INTO board (board_title, board_content, board_regdate, user_id, board_image) VALUES (?, ?, NOW(), ?, ?)`;
  const values = [subject, content, userId, imageUrlString];

  connection.query(sql, values, (err, result) => {
    if (err) {
      console.error('Error inserting data:', err);
      return res.status(500).send('Error inserting data');
    }
    console.log('Data inserted successfully');
    if (Array.isArray(req.body.image)) {
      console.log(req.file);
    }

    // 새로운 게시글이 등록된 후에 해당 게시글의 ID를 가져옵니다.
    connection.query('SELECT LAST_INSERT_ID() as lastId', (err, results) => {
      if (err) {
        console.error('Error fetching last insert id:', err);
        return res.status(500).send('Error fetching last insert id');
      }

      // 가져온 ID를 클라이언트로 전송하여 리다이렉트합니다.
      const newlyInsertedId = results[0].lastId;
      res.send(`<script>alert('게시물이 등록되었습니다.'); window.location.href='/view?board_idx=${newlyInsertedId}';</script>`);
    });
  });
});



// 게시물 상세보기
app.get('/view', (req: Request, res: Response) => {
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
    }
    const boardData = results[0]; // 첫 번째 결과를 사용
    const imageUrl = boardData.board_image.toString().split(',')
    // console.log(imageUrl);
    // console.log("🚀 ~ imageUrl:", imageUrl)

    // 조회수 증가
    // 실행할 SQL 쿼리
    const updateViewsSql = `UPDATE board SET board_views = board_views + 1 WHERE board_idx = ?`; 
    // 쿼리에 전달할 매개변수
    const idx = req.query.board_idx;   
    connection.query(updateViewsSql, [idx], (err, updateResult) => {
      if (err) {
        console.error('Error updating views:', err);
        return res.status(500).send('조회수 업데이트 중 오류가 발생했습니다.');
      }

      // 게시물에 대한 댓글 데이터 가져오기
      const idx = req.query.board_idx;
      const sql = `
        SELECT *, ROW_NUMBER() OVER (PARTITION BY board_idx ORDER BY comment_idx) AS row_num
        FROM comment WHERE board_idx = ?`;

      connection.query(sql, [idx], (error, commentResults) => {
      if (error) {
        console.error('Error fetching comment data:', error);
        return res.status(500).send('Error fetching comment data');
      }
      
      // 댓글 데이터를 렌더링할 때 템플릿에 전달
        res.render('view', { data: boardData, comments: commentResults, imageUrl: imageUrl })
        // res.json({ data: boardData, comments: commentResults, imageUrl: imageUrl })
        });
      });
    });
  });


// 상세보기에서 삭제 버튼 누를 시, 게시글 삭제
app.post('/viewDelete',(req: Request, res: Response)  => {
  const boardId = req.query.board_idx; // 댓글 ID
  const userId = req.session.user; // 현재 로그인된 사용자의 ID

  // 게시물이 찾기 SQL 쿼리
  const query = 'SELECT * FROM board WHERE board_idx = ?';
  connection.query(query, [boardId], (err, results) => {
    if (err) {
      console.error('Error finding comment:', err);
      res.status(500).json({ message: 'Error finding comment' });
      return;
    } const board = results[0]; // 결과 배열의 첫 번째 요소를 가져옴

    // 게시물이 존재하지 않는 경우
    if (!board) {
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
    connection.query(deleteQuery, [boardId], (err, results) => {
      if (err) {
        console.error('Error deleting comment:', err);
        res.status(500).json({ message: 'Error deleting comment' });
        return;
      }
      res.send(`<script>alert('삭제되었습니다.'); location.href='/list';</script>`);
    });
  });
});

// 댓글 삭제
app.post('/commentDelete', requireLogin,(req: Request, res: Response) => {
  const userId = req.session.user; // 현재 로그인된 사용자의 ID
  const boardIdx = req.body.board_idx;
  const commentIdx = req.body.comment_idx;

  // 댓글 찾기 SQL 쿼리
  const query = 'SELECT * FROM comment WHERE comment_idx = ?';
  connection.query(query, [commentIdx], (err, results) => {
    if (err) {
      console.error('Error finding comment:', err);
      res.status(500).json({ message: 'Error finding comment' });
      return;
    }

    // 댓글이 존재하지 않는 경우
    const comment = results[0]; // 결과 배열의 첫 번째 요소를 가져옴
    if (!comment) {
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
    connection.query(deleteQuery, [commentIdx], (err, results) => {
      if (err) {
        console.error('Error deleting comment:', err);
        res.status(500).json({ message: 'Error deleting comment' });
        return;
      }
      // 수정된 데이터를 가져온 후 수정된 view 페이지 가져오기
    const modifiedDataSql = `SELECT * FROM board WHERE board_idx = ?`;
    connection.query(modifiedDataSql, [boardIdx], (err, modifiedResults) => {
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
      const boardData = modifiedResults[0]; // 첫 번째 결과를 사용
      res.redirect(`/view?board_idx=${boardIdx}`);
      });
    });
  });
});


app.post('/like', requireLogin,(req: Request, res: Response) => {
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
      var idx = req.query.board_idx;
      res.send(`<script>alert('이미 좋아요를 누르셨습니다.'); window.location.href='/view?board_idx=${idx}';</script>`);
    } else {

      // 좋아요를 누르지 않은 경우
      // 좋아요를 기록하는 쿼리 실행
      const insertQuery = 'INSERT INTO likes (user_id, board_idx) VALUES (?, ?)';
      connection.query(insertQuery, [userId, boardId], (err, results) => {
        if (err) {
          console.error('Error inserting like:', err);
          res.status(500).send('Error inserting like');
          return;
        } console.log('Like recorded successfully');
      }); 
          var idx = req.query.board_idx;
          var sql =`UPDATE board SET board_like = board_like + 1 WHERE board_idx = ?`;
          
          connection.query(sql, [idx], function (err, results) {
          if (err) {
          console.error('Error deleting post:', err);
          res.status(500).json({ message: 'Error deleting post' });
          return;
          }
            console.log('Likes updated successfully');
            
                // 수정된 데이터를 가져온 후 수정된 view 페이지 가져오기
          const modifiedDataSql = `SELECT * FROM board WHERE board_idx = ?`;
          connection.query(modifiedDataSql, [boardId], (err, modifiedResults) => {
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
            const boardData = modifiedResults[0]; // 첫 번째 결과를 사용
            // res.render('view', { 'data': boardData });
            res.redirect(`/view?board_idx=${idx}`);
            });
          });
        }
    });
});

app.post('/commentlikes', requireLogin,(req: Request, res: Response) => {
  const userId = req.session.user; // 세션에서 사용자 ID 가져오기
  const boardIdx = req.body.board_idx;
  const commentIdx = req.body.comment_idx;

  // 좋아요를 누른 기록이 있는지 확인하는 쿼리
  const query = 'SELECT * FROM commentlikes WHERE user_id = ? AND comment_idx = ?';
  connection.query(query, [userId, commentIdx], (err, results) => {
    if (err) {
      console.error('Error checking like:', err);
      res.status(500).send('Error checking like');
      return;
    }

    if (results.length > 0) { // 이미 좋아요를 누른 경우
      console.log('Duplicate like');
      res.send(`<script>alert('이미 좋아요를 누르셨습니다.'); window.location.href='/list';</script>`);
    } else {
      
      // 좋아요를 누르지 않은 경우
      // 좋아요를 기록하는 쿼리 실행
      const insertQuery = 'INSERT INTO commentlikes (user_id, comment_idx) VALUES (?, ?)';
      connection.query(insertQuery, [userId, commentIdx], (err, results) => {
        if (err) {
          console.error('Error inserting like:', err);
          res.status(500).send('Error inserting like');
          return;
        } console.log('Like recorded successfully');
      }); 
            var idx = req.query.comment_idx;
            var sql =`UPDATE comment SET comment_like = comment_like + 1 WHERE comment_idx = ?`;
            connection.query(sql, [idx], function (err, results) {
            if (err) {
            console.error('Error deleting post:', err);
            res.status(500).json({ message: 'Error deleting post' });
            return;
            }
              console.log('Likes updated successfully');

              // var idx = req.query.board_idx;
              // 수정된 데이터를 가져온 후 수정된 view 페이지 가져오기
            const modifiedDataSql = `SELECT * FROM board WHERE board_idx = ?`;
            connection.query(modifiedDataSql, [boardIdx], (err, modifiedResults) => {
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
              const boardData = modifiedResults[0]; // 첫 번째 결과를 사용
              res.redirect(`/view?board_idx=${boardIdx}`);
              });
            });
        }
    });
});




// 게시물 수정 - 수정 전 데이터 가져오기
app.post('/modify', (req: Request, res: Response)  => {
  const idx = req.query.board_idx;
  const userId = req.session.user; // 현재 로그인된 사용자의 ID
  
  
  // 수정 전 데이터를 가져오기
  const selectSql = `SELECT * FROM board WHERE board_idx = ?`;
  connection.query(selectSql, [idx], (err, results) => {
    // 댓글의 소유자가 아닌 경우
    const board = results[0]; // 결과 배열의 첫 번째 요소를 가져옴
    if (err) {
      console.error('Error fetching original data:', err);
      res.status(500).json({ message: 'Error fetching original data' });
      return;
    }
    
    if (results.length === 0) {
      console.error('No original data found');
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
app.post('/modifyProc', upload.array('myFiles', 5), (req: Request, res: Response)  => {
  const idx = req.query.board_idx;
  const newTitle = req.body.subject;
  const newWriter = req.body.writer;
  const newContent = req.body.content;

  const files = req.files as Express.Multer.File[];
    
    // Check if files were uploaded
    if (!files || files.length === 0) {
      return res.status(400).send('No files uploaded');
    }
    
    // Process uploaded files (extract filenames)
    const imageUrls: string[] = files.map(file => {
      return file.filename; // Assuming file.filename contains the generated filename
    });
  
  const imageUrlString = imageUrls.join(',');

  // 데이터 수정
  const updateSql = `UPDATE board SET board_title = ?, board_writer = ?, board_content = ?,  board_image= ? WHERE board_idx = ?`;
  connection.query(updateSql, [newTitle, newWriter, newContent, imageUrlString, idx], (err, updateResult) => {
    if (err) {
      console.error('Error updating data:', err);
      res.status(500).json({ message: 'Error updating data' });
      return;
    } if (updateResult.affectedRows == 0) {
      console.error('No modified data found');
      res.status(404).json({ message: 'No modified data found' });
      return;
    } console.log('Data updated successfully');
      // console.log("🚀 ~ imageUrl:", imageUrlString)

    // 수정된 데이터를 가져온 후 수정된 view 페이지 가져오기
    const modifiedDataSql = `SELECT * FROM board WHERE board_idx = ?`;
    connection.query(modifiedDataSql, [idx], (err, modifiedResults) => {
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
      const boardData = modifiedResults[0]; // 첫 번째 결과를 사용
      // res.render('view', { 'data': boardData });
      res.redirect(`/view?board_idx=${idx}`);
        });
      });
    });
});
  
app.post('/commentFrm', (req: Request, res: Response)  => {
  const boardIdx = req.body.board_idx;
  const commentIdx = req.body.comment_idx;
  const commentContent = req.body.comment; // 수정된 댓글 내용
  const userId = req.session.user; // 현재 사용자 ID (세션에서 가져옴)
  
  // 수정 전 데이터를 가져오기
  const selectSql = `SELECT * FROM comment WHERE comment_idx = ?`;
  connection.query(selectSql, [commentIdx], (err, results) => {
    if (err) {
      console.error('Error fetching original data:', err);
      res.status(500).json({ message: 'Error fetching original data' });
      return;
    }

    if (results.length === 0) {
      console.error('No original data found');
      res.status(404).json({ message: 'No original data found' });
      return;
    }

    const originalComment = results[0];

    // 댓글의 소유자인지 확인
    if (originalComment.user_id !== userId) {
      res.send(`<script>alert('수정 권한이 없습니다.'); window.location.href='/list';</script>`);
      return;
    }
    
    // 데이터 수정
    const updateSql = `UPDATE comment SET comment = ?  WHERE comment_idx = ?`;
    connection.query(updateSql, [commentContent, commentIdx], (err, updateResult) => {
      if (err) {
        console.error('Error updating data:', err);
        res.status(500).json({ message: 'Error updating data' });
        return;
      }
      
      if (updateResult.affectedRows === 0) {
        console.error('11No modified data found');
        res.status(404).json({ message: '11No modified data found' });
        return;
      } console.log('Comment Data updated successfully');

      // 수정된 데이터를 가져온 후 수정된 view 페이지 가져오기
        const modifiedDataSql = `SELECT * FROM board WHERE board_idx = ?`;
        connection.query(modifiedDataSql, [boardIdx], (err, modifiedResults) => {
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
          const boardData = modifiedResults[0]; // 첫 번째 결과를 사용
          res.redirect(`/view?board_idx=${boardIdx}`);
          });
    });
  });
});





  // 댓글 달기
app.post('/comment',(req: Request, res: Response)  => {
  const userId = req.session.user;
  const content = req.body.content;
  const boardId = req.query.board_idx;
  var sql = `INSERT INTO comment(user_id, comment, board_idx, row_num, comment_regdate) 
  SELECT ?, ?, ?, IFNULL(MAX(row_num), 0) + 1, now() FROM comment WHERE board_idx = ?`;
  var values = [userId, content, boardId, boardId];
  
  // 데이터 삽입
  connection.query(sql, values, function (err, result) {
    if (err) {
      console.error('Error inserting data:', err);
      res.status(500).send('Error inserting data');
      return;
    } console.log('Data inserted successfully');

    // view 페이지 가져오기
    const modifiedDataSql = `SELECT * FROM board WHERE board_idx = ?`;
    connection.query(modifiedDataSql, [boardId], (err, modifiedResults) => {
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
      // res.send("<script> alert('등록되었습니다.'); location.href='/list';</script>");
      res.redirect(`/view?board_idx=${boardId}`);
        });
    });
});



// app.get('/board', requireLogin, (req, res) => {
//   // 게시판 페이지를 보여주는 라우트 핸들러
// });

// 회원가입
app.post('/join', (req: Request, res: Response)  => {
  const id = req.body.id;
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
app.get('/login', (req: Request, res: Response) => {
  res.render('login', { title: "로그인" })
})


// 로그인 처리
app.post('/login', (req: Request, res: Response)  => {
  const id = req.body.id;
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

/////////////////////////////////////////////////////////////////////////


app.get('/upload', (req, res) => {
  res.render('upload.ejs');
});

app.post("/upload", upload.single('myFile'), (req, res) => {
  console.log(req.file);
  res.status(200).send("uploaded");
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
