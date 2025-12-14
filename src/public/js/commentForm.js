document.addEventListener("DOMContentLoaded", () => {
  const textarea = document.querySelector('.comment-form textarea[name="content"]');
  const charCount = document.querySelector('.comment-form .char-count');
  
  if (!textarea || !charCount) return;
  
  const updateCharCount = () => {
    const length = textarea.value.length;
    charCount.textContent = `${length}/500 characters`;
    
    if (length > 500) {
      charCount.style.color = 'var(--bad)';
    } else if (length > 450) {
      charCount.style.color = 'var(--muted)';
    } else {
      charCount.style.color = 'var(--muted)';
    }
  };
  
  textarea.addEventListener('input', updateCharCount);
  updateCharCount();
  
  const form = document.querySelector('.comment-form');
  if (form) {
    form.addEventListener('submit', (e) => {
      const content = textarea.value.trim();
      if (!content || content.length === 0) {
        e.preventDefault();
        alert('Comment cannot be empty.');
        return false;
      }
      if (content.length > 500) {
        e.preventDefault();
        alert('Comment must be 500 characters or less.');
        return false;
      }
    });
  }
});

