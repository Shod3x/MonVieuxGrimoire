const { User, Book } = require("./db/mongo");
const sharp = require('sharp');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcrypt');
const multer = require("multer");
const jwt = require("jsonwebtoken");
const app = express();

const PORT = process.env.PORT || 4000;

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, "uploads");
    },
    filename: function (req, file, cb) {
        const fileName = file.originalname.toLowerCase() + Date.now() + ".jpg";
        cb(null, Date.now() + "-" + fileName);
    }
});

const upload = multer({
    storage: storage
});

app.use(cors());
app.use(express.json());
app.use("/images", express.static("uploads"));

app.listen(PORT, function () {
    console.log(`App listening on port ${PORT}!`)
});


app.post("/api/auth/signup", signUp);
app.post("/api/auth/login", login);
app.get("/api/books", getBooks);
app.post("/api/books", checkToken, upload.single("image"), postBooks);
app.get("/api/books/bestrating", getBestrating);
app.get("/api/books/:id", getBookById);
app.delete("/api/books/:id", checkToken, deleteBook);
app.put("/api/books/:id", checkToken, upload.single("image"), putBooks);
app.post("/api/books/:id/rating", checkToken, postRating);


async function postRating(req, res) {
    const id = req.params.id;

    if (!id || id === "undefined") {
        res.status(400).send("Book id is missing");
        return;
    }

    const rating = req.body.rating;
    const userId = req.tokenPayload.userId;

    try {
        const book = await Book.findById(id);

        if (!book) {
            res.status(404).send("Book not found");
            return;
        }

        if (!Array.isArray(book.ratings)) {
            book.ratings = [];
        }

        const alreadyRated = book.ratings.find(rating => rating.userId == userId);

        if (alreadyRated) {
            res.status(400).send("You have already rated this book");
            return;
        }

        const newRating = { userId, grade: rating };

        book.ratings.push(newRating);
        book.averageRating = averageRating(book.ratings);
        await book.save();
        res.send(book);
    } catch (e) {
        console.error(e);
        res.status(500).send("Something went wrong: " + e.message);
    }
}

function averageRating(ratings) {
    const length = ratings.length;
    const ratingSum = ratings.reduce((sum, rating) => sum + rating.grade, 0);
    const AverageRating = Math.round(ratingSum / length);
    return AverageRating;
}

async function getBestrating(req, res) {
    try {
        const bookBestRating = await Book.find().sort({ rating: -1 }).limit(3);
        bookBestRating.forEach((book) => {
            book.imageUrl = "http://localhost:4000/images/" + book.imageUrl;
        });
        res.send(bookBestRating);
    } catch (e) {
        console.error(e);
        res.status(500).send("Something went wrong:" + e.message);
    }
}

async function putBooks(req, res) {
    const id = req.params.id;
    const book = JSON.parse(req.body.book);
    const bookInDB = await Book.findById(id);

    if (bookInDB == null) {
        res.status(404).send("Book not found");
        return;
    }

    const userIdInDB = bookInDB.userId;
    const userIdInToken = req.tokenPayload.userId;

    if (userIdInDB != userIdInToken) {
        res.status(403).send("Forbidden");
    }

    const newBook = {};
    if (book.title) newBook.title = book.title;
    if (book.author) newBook.author = book.author;
    if (book.year) newBook.year = book.year;
    if (book.genre) newBook.genre = book.genre;
    if (book.title) newBook.title = book.title;

    try {
        if (req.file != null) {
            const webpFilename = `${Date.now()}-${req.file.originalname.toLowerCase()}.webp`;
            await sharp(req.file.path)
                .webp({ quality: 80 })
                .toFile(`uploads/${webpFilename}`);
            newBook.imageUrl = webpFilename;
        }

        await Book.findByIdAndUpdate(id, newBook);
        res.send("Book updated");
    } catch (e) {
        console.error(e);
        res.status(500).send("Something went wrong");
    }
}

async function deleteBook(req, res) {
    const id = req.params.id;
    try {
        const bookInDB = await Book.findById(id);
        if (bookInDB == null) {
            res.status(404).send("Book not found");
            return;
        }
        const userIdInDB = bookInDB.userId;
        const userIdInToken = req.tokenPayload.userId;
        if (userIdInDB != userIdInToken) {
            res.status(403).send("Forbidden");
        }
        await Book.findByIdAndDelete(id);
        res.send("Book deleted");
    } catch (e) {
        console.error(e);
        res.status(500).send("Something went wrong :" + e.message);
    }
}

async function postBooks(req, res) {
    const file = req.file;
    const stringBook = req.body.book;
    const book = JSON.parse(stringBook);

    try {
        if (file) {
            const webpFilename = `${Date.now()}-${file.originalname.toLowerCase()}.webp`;
            await sharp(file.path)
                .webp({ quality: 80 })
                .toFile(`uploads/${webpFilename}`);
            book.imageUrl = webpFilename;
        }

        await Book.create(book);
        res.send({ message: "Book posted" });
    } catch (e) {
        console.error(e);
        res.status(500).send("Something went wrong");
    }
}

async function signUp(req, res) {
    const email = req.body.email;
    const password = req.body.password;
    const userInDb = await User.findOne({
        email: email
    });

    if (userInDb != null) {
        res.status(400).send("Email already exists");
        return;
    }

    const user = {
        email: email,
        password: hashPass(password)
    };
    try {
        await User.create(user);
    } catch (e) {
        console.error(e);
        res.status(500).send("Something went wrong");
        return;
    }
    res.send("Sign up")
}

async function login(req, res) {
    const body = req.body
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!body.email || !emailRegex.test(body.email) || !body.password) {
        res.status(400).send("Invalid email or password");
        return;
    }

    const userInDb = await User.findOne({
        email: body.email
    });

    if (userInDb == null) {
        res.status(401).send("Wrong email");
        return;
    }

    const passwordInDb = userInDb.password;

    if (!isPassCorrect(req.body.password, passwordInDb)) {
        res.status(401).send("Wrong pass");
        return;
    }

    res.send({
        userId: userInDb._id,
        token: generateToken(userInDb._id)
    });
}

async function getBooks(req, res) {
    const booksInDb = await Book.find();
    booksInDb.forEach((book) => {
        book.imageUrl = "http://localhost:4000/images/" + book.imageUrl;
    });
    res.send(booksInDb);
}

async function getBookById(req, res) {
    const id = req.params.id;
    try {
        const book = await Book.findById(id);

        if (book == null) {
            res.status(404).send("Book not found");
            return;
        }
        book.imageUrl = "http://localhost:4000/images/" + book.imageUrl;
        res.send(book);
    } catch (e) {
        console.error(e);
        res.status(500).send("Error :" + e.message);
    }

}

function hashPass(password) {
    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(password, salt)
    return hash;
}

function isPassCorrect(password, hash) {
    return bcrypt.compareSync(password, hash);
}

function generateToken(uid) {
    const payload = {
        userId: uid
    }
    const token = jwt.sign(payload, process.env.JWT, {
        expiresIn: "1d"
    });
    return token;
}

function checkToken(req, res, next) {
    const headers = req.headers;
    const auth = headers.authorization;
    if (auth == null) {
        res.status(401).send("Unauthorized");
        return;
    }
    const token = auth.split(" ")[1];
    try {
        const tokenPayload = jwt.verify(token, process.env.JWT);
        if (tokenPayload == null) {
            res.status(401).send("Unauthorized");
            return;
        }
        req.tokenPayload = tokenPayload
        next();
    } catch (e) {
        console.error(e);
        res.status(401).send("Unauthorized")
    }
}
