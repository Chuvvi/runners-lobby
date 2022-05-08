const bcrypt = require('bcrypt');
const saltRounds = 16;
const mongoCollections = require('../config/mongoCollections');
const { checkStr, checkEMail, checkNum, checkPassword, isPresent, checkAge, checkRating } = require('../errorHandling');
const users = mongoCollections.users;
const reviews = mongoCollections.reviews;
const threads = mongoCollections.threads;
const { ObjectId } = require('mongodb');
const { del } = require('express/lib/application');

function checkID(id){
    if(id === undefined || id === null) throw `ID not present`;
    checkStr(id);
    if(!ObjectId.isValid(id)) throw `Invalid User`;
}

async function getUser(id){
    checkID(id);
    id = id.trim();
    id = ObjectId(id);
    const userCollection = await users();
    userData = await userCollection.findOne({_id: id});
    if(userData === null) throw `Invalid User`;
    return userData;
}


async function signUp(firstName, lastName, email, password, gender, city, state, age){
    // Check inputs
    firstName = checkStr(firstName, "First Name");
    lastName = checkStr(lastName, "Last Name");
    email = checkStr(email, "Email");
    email = checkEMail(email);
    checkPassword(password);
    gender = checkStr(gender, "Gender");
    city = checkStr(city, "City");
    state = checkStr(state, "State");
    checkAge(age);

    // add user to the database
    const userCollection = await users();
    const getEmail = await userCollection.findOne(
        {'email': email}
    );
    if(getEmail) throw `Email already in use`;
    const pass = await bcrypt.hash(password, saltRounds);
    let newUser = {
        firstName: firstName,
        lastName: lastName,
        email: email,
        password: pass,
        gender: gender,
        city: city,
        state: state,
        age: age,
        friends: new Set([]),
        friendReq: new Set([]),
        friendReqSent: new Set([]),
        userReviews: new Set([]),
        userThreads: new Set([]),
        userLikes: new Set([]),
        blockedUsers: new Set([]),
        savedReviews: new Set([])
    }
    const res = await userCollection.insertOne(newUser);
    if(!res.acknowledged || !res.insertedId) throw `Could not insert User`;
    const userInfo = await userCollection.findOne({email: email});
    return {authenticated: true, userInserted: true, _id: userInfo._id};
}

async function login(email, password){
    // Check inputs
    email = checkStr(email);
    email = checkEMail(email);
    checkPassword(password);

    // Validate User
    const userCollection = await users();
    const user = await userCollection.findOne({
        email: email
    });
    if(!user) throw `Either the email or password is invalid`;
    const res = await bcrypt.compare(password, user.password);
    if(res === true){
        const userInfo = await userCollection.findOne({email: email});
        return {authenticated: true, _id: userInfo._id};
    }
    else throw `Either the email or password is invalid`;
}

async function postReview(data){
    let {title, category, review, rating} = data;
    title = checkStr(title, "Title");
    category = checkStr(category, "Category");
    review = checkStr(review, "Review");
    rating = checkNum(rating, "Rating");
    checkRating(rating);
    
    const userCollection = await users();
    const user = await userCollection.findOne({_id: ObjectId(data.userID)});
    let name = `${user.firstName} ${user.lastName}`;
    data.name = name;
    data.likes = new Set([]);
    data.comments = [];
    const reviewCollection = await reviews();
    let res = await reviewCollection.insertOne(data);
    if(!res.acknowledged || !res.insertedId) throw `Could not insert review`;
    data = await reviewCollection.findOne({_id: res.insertedId});
    
    user.userReviews[data._id] = user._id;
    res = await userCollection.updateOne({_id: ObjectId(data.userID)}, {$set: user});
    if(!res.acknowledged || !res.modifiedCount) throw `Could not insert review`;
    return data;
}

async function getAllReviews(){
    const reviewCollection = await reviews();
    const data = await reviewCollection.find({}).toArray();
    return data;
}

async function updateUser(updateParams, id){
    const names = {
        firstName: "First Name",
        lastName : "Last Name",
        email: "E-Mail",
        password: "Password",
        gender: "Gender",
        city: "City",
        state: "State",
        age: "Age"
    }
    const userCollection = await users();
    const user = await userCollection.findOne({_id: ObjectId(id)})
    if(user === null) throw `Could not find user. Please try again later.`;
    for(let p in updateParams){
        if(updateParams[p] === user[p]) throw `${names[p]} is same as before. Please enter new ${names[p]}.`;
    }
    let res;
    if(updateParams.email !== undefined){
        res = await userCollection.findOne({email: updateParams.email});
        if(res !== null) throw `E-Mail already in use. Please use a different email.`;
    }
    if(updateParams.password !== undefined){
        res = await bcrypt.compare(updateParams.password, user.password);
        if(res === true) throw `Password is same as old password. Please enter a new password.`;
        updateParams.password = await bcrypt.hash(updateParams.password, saltRounds);
    }
    let name = "";
    if(('firstName' in updateParams) || ('lastName' in updateParams)){
        if('firstName' in updateParams) name += updateParams['firstName'] + " ";
        else name += user['firstName'] + " ";
        if('lastName' in updateParams) name += updateParams['lastName'];
        else name += user['lastName'];
    }
    if(name.length !== 0){
        for(let i of user.userReviews){
            i['name'] = name;
        }
        updateParams.userReviews = user.userReviews;
    }
    res = await userCollection.updateOne({_id: ObjectId(id)}, {$set: updateParams});
    if(!res.acknowledged || !res.modifiedCount) throw `Could not edit personal information. Please try again later.`;
    
    // update reviews
    const reviewCollection = await reviews();
    res = await reviewCollection.findOne({'userID': id});
    if(res !== null) await reviewCollection.updateMany({'userID': id}, {$set: {"name": name}});
}

async function updateFriends(data){
    if(!("friendReqSent" in data)) data["friendReqSent"] = {};
    if(!("friendReq" in data)) data["friendReq"] = {};
    if(!("friends" in data)) data["friends"] = {};
    if(!("blockedUsers" in data)) data["blockedUsers"] = {};
    if(!("userReviews" in data)) data["userReviews"] = {};
    if(!("userThreads" in data)) data["userThreads"] = {};
    if(!("userLikes" in data)) data["userLikes"] = {};
    if(!("savedReviews" in data)) data["savedReviews"] = {};
    const userCollection = await users();
    let id = data._id;
    delete data._id;
    const res = await userCollection.updateOne({_id: ObjectId(id)}, {$set: data});
    return res;
}

async function postThread(title,postedDate,text,voting,userId){
    title = checkStr(title, "Title");
    text = checkStr(text, "Post text");
    if(typeof voting != 'number'){
        voting = checkNum(voting, "Voting");
    }
    
    let data = {
        title: title,
        postedDate: postedDate,
        text: text,
        voting: voting,
        comments: []
    }

    // Insert thread into database
    const threadCollection = await threads();
    let res = await threadCollection.insertOne(data);
    if(!res.acknowledged || !res.insertedId) throw `Could not insert thread`;
    
    // Insert thread into user threads
    const userCollection = await users();
    res = await userCollection.updateOne({_id: ObjectId(userId)}, {$push: {userThreads: data}})
    if(!res.acknowledged || !res.modifiedCount) throw `Could not update user`;
    return data;
}

async function getAllThreads(){
    const threadCollection = await threads();
    const data = await threadCollection.find({}).toArray();
    return data;
}

async function getThreadTitle(title){
    title = checkStr(title);
    const threadCollection = await threads();
    const data = await threadCollection.findOne({title: title});
    if (data === null){
        return -1;
    }
    return data;
}

async function getThreadId(id){
    checkID(id);
    const threadCollection = await threads();
    const data = await threadCollection.findOne({_id: ObjectId(id)});
    if (data === null){
        return -1;
    }
    return data;
}

async function postThreadComment(comment, threadId, userId){
    comment = checkStr(comment);
    checkID(threadId);
    checkID(userId);
    userData = await getUser(userId);
    let commentId = new ObjectId();
    let data = {
        _id: commentId,
        userName : `${userData.firstName} ${userData.lastName}`,
        userId: ObjectId(userId),
        comment: comment
    }
    const threadCollection = await threads();
    res = await threadCollection.updateOne({_id: ObjectId(threadId)}, {$push: {comments: data}})
    if(!res.acknowledged || !res.modifiedCount) throw `Could not update thread`;
    return data;
}

async function getAllReviewComments(id) {
    checkID(id);
    const reviewsCollection = await reviews();
    const reviews = await reviewsCollection.findOne({ _id: ObjectId(id) });

    if (!reviews) throw 'Could not find review with id of ' + id;

    return reviews.comments;
}

async function getReviews(id) {
    checkID(id);
    if (id === undefined) throw 'You must provide an ID';
    const reviewsCollection = await reviews();
    const review = await reviewsCollection.findOne({ _id: ObjectId(id) });

    if (!review) throw 'Could not find post with id of ' + id;
    let updatedIdReview = review;
    updatedIdReview._id = ObjectId(updatedIdReview._id).toString();
    return updatedIdReview;
}

async function postReviewComments(reviewId, userId, comments){
    comments = checkStr(comments, "Comment");
    checkID(reviewId);
    checkID(userId);
    userData = await getUser(userId);
    let commentId = new ObjectId();
    let data = {
        _id: commentId,
        userName : `${userData.firstName} ${userData.lastName}`,
        userId: ObjectId(userId),
        comments: comments
    }
    const reviewsCollection = await reviews();
    const updateInfo = await reviewsCollection.updateOne(
        { _id: ObjectId(reviewId) },
        { $push: { comments: data } }

    );
    if (!updateInfo.matchedCount && !updateInfo.modifiedCount) throw 'Update failed';
    return data;
}

async function updateReview(data){
    const reviewsCollection = await reviews();
    let id = data._id;
    delete data._id;
    const res = await reviewsCollection.updateOne({_id: ObjectId(id)}, {$set: data});
    return res;
}

async function sortReviewLikes(){
    let reviews = await getAllReviews();
    function sortByLike(a, b) {
        return Object.keys(b.likes).length - Object.keys(a.likes).length;
    }
    reviews.sort(sortByLike);
    let result = [];
    for (let i = 0; i < reviews.length; i++) {
        result.push(reviews[i]);
    }
    return result;
}

async function sortThreadLikes(){
    let threads = await getAllThreads();
    function sortByLike(a, b) {
        return Object.keys(b.likes).length - Object.keys(a.likes).length;
    }
    threads.sort(sortByLike);
    let result = [];
    for (let i = 0; i < threads.length; i++) {
        result.push(threads[i]);
    }
    return result;
}

async function popularPage(){
    let popularThreads = await sortThreadLikes();
    let popularReviews = await sortReviewLikes();
    return {
        popularThreads: popularThreads,
        popularReviews: popularReviews
    }

}

module.exports = {
    signUp,
    login,
    postReview,
    getAllReviews,
    getReviews,
    getUser,
    updateUser,
    updateFriends,
    postThread,
    getAllThreads,
    getThreadTitle,
    postReviewComments,
    getAllReviewComments,
    getThreadId,
    checkID,
    postThreadComment,
    updateReview,
    popularPage
}