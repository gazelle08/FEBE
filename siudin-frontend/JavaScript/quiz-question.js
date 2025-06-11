// Function to handle question navigation
function goToQuestion(questionNumber) {
    // Remove active class from all buttons
    document.querySelectorAll('.question-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Add active class to clicked button
    event.target.classList.add('active');
    
    // Here you would typically navigate to the specific question
    console.log(`Navigating to question ${questionNumber}`);
    
    // You can add your navigation logic here
    // For example: window.location.href = `#question-${questionNumber}`;
}

// Handle answer selection
document.querySelectorAll('.answer-option').forEach(option => {
    option.addEventListener('click', function() {
        // Remove selected class from all options
        document.querySelectorAll('.answer-option').forEach(opt => {
            opt.classList.remove('selected');
            opt.innerHTML = opt.innerHTML.replace('<i class="fas fa-check"></i>', '<i class="far fa-circle"></i>');
        });
        
        // Add selected class to clicked option
        this.classList.add('selected');
        this.innerHTML = this.innerHTML.replace('<i class="far fa-circle"></i>', '<i class="fas fa-check"></i>');
    });
});

// Timer functionality (optional)
let timeRemaining = 15.00;
const timerElement = document.querySelector('.time-remaining');

function updateTimer() {
    if (timeRemaining > 0) {
        timeRemaining -= 0.01;
        timerElement.textContent = timeRemaining.toFixed(2);
    }
}

// Uncomment to start timer
// setInterval(updateTimer, 10);