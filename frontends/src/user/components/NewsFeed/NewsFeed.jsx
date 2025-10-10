import React from "react";
import "./NewsFeed.css";

const NewsFeed = () => {
  return (
    <div className="newsFeed">
      <h1>Our News Feed</h1>
      <p>
        Brightening your celebrations with stunning balloon and floral designs.
        Explore our creations and make every moment special.
        <div className="image-container">
          <img
            src='/setting.png'
            title="Our current update news 
will be uploaded here 👈.
Stay tune for more upcoming
           UPDATE  ⚠"
            alt=""
          />
        </div>
      </p>
    </div>
  );
};

export default NewsFeed;
