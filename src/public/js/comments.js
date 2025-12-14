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

        // Add loading state
        button.prop('disabled', true);
        const originalContent = button.html();

        $.ajax({
            url: `/comment/${commentId}/vote`,
            method: "POST",
            data: JSON.stringify({type, incidentId}),
            contentType: 'application/json',
            success: function(data){
                // Update like count
                $(`#likeCount-${commentId}`).text(data.likes);
                // Update dislike count
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
    const message = `<div id="loginMessage-${commentId}" class="loginRequired" style="margin-top: 0.5rem; color: var(--muted); font-size: 0.9rem;">
      <a href="/auth/login" style="color: var(--accent);">Log in</a> to like or dislike comments.
    </div>`;

    $(`#comment-${commentId} .comment-actions`).after(message);
}