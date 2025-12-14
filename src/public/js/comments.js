$(document).ready(function(){
    $(".voteButton").click(function(e){
        e.preventDefault();
        const button = $(this);
        const commentId = button.data("comment-id");
        const commentElement = $(`#comment-${commentId}`);
        const userId = commentElement.data("user-id");
        const type = button.data("type");
        const incidentId = button.data("incident-id");

        if(!userId){
            showLoginMessage(commentId);
            return;
        }

        $.ajax({
            url: `/comment/${commentId}/vote`,
            method: "POST",
            data: JSON.stringify({type, incidentId}),
            contentType: 'application/json',
            success: function(data){
                $(`#likeButton-${commentId}`).text(data.likes);
                $(`#dislikeButton-${commentId}`).text(data.dislikes);
            },
            error: function(err){
                console.error("Vote failed: ", err.responseText);
            }
        })
    })
})

function showLoginMessage(commentId){
    const container = $(`#loginMessage-${commentId}`);
    if(container.length){
        return;
    }
    const message = `<div id="loginMessage-${commentId}" class="loginRequired">
      <a href="/auth/login">Log in</a> to like or dislike comments.
    </div>`;

    $(`#comment-${commentId}`).append(message);
}