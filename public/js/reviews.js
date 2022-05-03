(function ($){
    var newPostForm = $('#newPostForm');
    var title = $('#title');
    var cat = $('#cat');
    var rating = $('#rating');
    var review = $('#review');
    var date = new Date().toISOString().split("T")[0].replaceAll("-", "/");
    var feed = $('#feed');
    var reviewList = $('#reviewList');


    function makeReview(data){
        let{title, category, rating, review, postedDate, vote, name, userID} = data;
        title = `<h1>${title}</h1>`;
        category = `<h2>${category}</h2>`;
        rating = `<h2>${rating}</h2>`;
        review = `<p>${review}</p>`;
        postedDate = `<h3>${postedDate}</h3>`;
        vote = `<h3>${vote}</h3>`;
        name = `<h3><a href = '/userinfo/${userID}'>${name}</h3>`;
        return `<div>${title}${category}${rating}${review}${postedDate}${vote}${name}<div>`;
    }

    async function addReviews(a){
        let title = a.title;
        let id = a._id;
        var info = {
            method: 'POST',
            url: `/userinfo/${a.userID}`
        };
        await $.ajax(info).then(function(res){
            const {data, currUser} = res;
            if(!(data._id in currUser.blockedUsers) && !(currUser._id in data.blockedUsers)) reviewList.append(`<li><a href='/review/${id}'> ${title} </a> </li>`);
        })
    }

    $(function () {
        var requestConfig = {
            method: 'GET',
            url: '/getallreviews'
        };
        $.ajax(requestConfig).then(function (responseMessage) {
            let c = 0;
            $.each(responseMessage, function(){
                addReviews(this);
            })
        });
    });

    function populate(){
        var populateFeed = {
            method: 'GET',
            url: '/getallreviews'
        }
        $.ajax(populateFeed).then(function(res){
            $.each(res, function(){
                let rev = makeReview(this);
                feed.prepend(rev);
            })
        })
    }
/*
    if(newPostForm.length){
        populate();
        reviewComment.show();
    }
*/


    newPostForm.submit(function (event){
        event.preventDefault();
        let titleVal = title.val();
        let catVal = cat.val();
        let ratingVal = rating.val();
        let reviewVal = review.val();
        let newReview = {
            title : titleVal,
            category : catVal,
            review : reviewVal,
            postedDate : date,
            rating : ratingVal,
            vote : 0,
            comments: []
        }
        var postReview = {
            method: 'POST',
            url: '/postreview',
            data: newReview
        }
        $.ajax(postReview).then(function(res){
            let postReview = makeReview(res)
            feed.prepend(postReview);
        });
    });

})(window.jQuery);