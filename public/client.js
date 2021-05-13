/*
    Will Gillette | 4 January 2021 | Biography Javascript | app.js
*/

/* Event Handlers */

/*
    Toggle Directory Function
    Toggles the side menu
*/

var directoryOpen = false;
function toggleSideBar(){
    const main = document.getElementById("main");
    const scrollBar = document.getElementById("scrollbar");
    const logOutBtn = document.getElementById("logoutBtn");
    let wRes = window.screen.width;
    console.log(wRes);
    if (wRes > 1050){ // For PC
      scrollBar.style.width = !directoryOpen && "10%" || "0%";
      main.style.width = !directoryOpen && "87.5vw" || "98vw";
      main.style.marginLeft = !directoryOpen && "10%" || "0%";
    } else { // For mobile devices
      scrollBar.style.width = !directoryOpen && "30%" || "0%";
      main.style.width = !directoryOpen && "70vw" || "98vw";
      main.style.marginLeft = !directoryOpen && "30%" || "0%";
      logOutBtn.style.width = !directoryOpen && "1.8em" || "3.6em";
    }
    directoryOpen = !directoryOpen;
}

/*
  File Validation Function
  Checks if a file is an image file
*/

function fileValidation() { 
    var fileInput = document.getElementById('avatarUpload'); 
    var filePath = fileInput.value;
    var allowedExtensions =  /(\.jpg|\.jpeg|\.png|\.gif)$/i; 

    if (!allowedExtensions.exec(filePath)) { 
        alert('Invalid avatar upload.'); 
        fileInput.value = ''; 
        return false; 
    }  
    else  
    { 

        // Image preview 
        if (fileInput.files && fileInput.files[0]) { 
            var reader = new FileReader(); 
            reader.onload = function(e) { 
                document.getElementById('imagePreview').src = e.target.result; 
            }; 

            reader.readAsDataURL(fileInput.files[0]); 
        } 
    } 
} 