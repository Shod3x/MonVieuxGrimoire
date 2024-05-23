require("dotenv").config();
const mongoose = require('mongoose');

const DB_URL = `mongodb+srv://${process.env.USER}:${process.env.PASSWORD}@${process.env.DB_DOMAIN}`;

async function connect() {
    try {
        await mongoose.connect(DB_URL);
        console.log("Connected to DB");
    } catch (e) {
        console.error(e);
    }
}

connect();

const UserSchema = new mongoose.Schema({
    email: String,
    password: String
});

const BookSchema = new mongoose.Schema({
    userId: String,
    title: String,
    author: String,
    year: Number,
    genre: String,
    imageUrl: String,
    ratings: [
        {
            userId: String,
            grade: Number
        }
    ],
    averageRating: Number
});

const User = mongoose.model("User", UserSchema);

const Book = mongoose.model("Book", BookSchema);

module.exports = { User, Book };