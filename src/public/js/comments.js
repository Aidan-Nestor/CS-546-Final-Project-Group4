$(document).ready(function(){
    $(".vote-btn").click(function(e){
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

        button.prop('disabled', true);
        const originalContent = button.html();

        $.ajax({
            url: `/comment/${commentId}/vote`,
            method: "POST",
            data: JSON.stringify({type, incidentId}),
            contentType: 'application/json',
            success: function(data){
                $(`#likeCount-${commentId}`).text(data.likes);
                $(`#dislikeCount-${commentId}`).text(data.dislikes);
            },
            error: function(err){
                console.error("Vote failed: ", err.responseText);
            },
            complete: function(){
                button.prop('disabled', false);
            }
        })
    })
})

function showLoginMessage(commentId){
    const container = $(`#loginMessage-${commentId}`);
    if(container.length){
        return;
    }
    const messageDiv = $('<div>', {
        id: `loginMessage-${commentId}`,
        class: 'loginRequired login-message'
    });
    const loginLink = $('<a>', {
        href: '/auth/login',
        text: 'Log in',
        class: 'login-link'
    });
    messageDiv.append(loginLink);
    messageDiv.append(' to like or dislike comments.');
    
    $(`#comment-${commentId} .comment-actions`).after(messageDiv);
}