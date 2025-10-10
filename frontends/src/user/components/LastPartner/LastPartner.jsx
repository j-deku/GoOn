/* eslint-disable */
import React from 'react';
import './LastPartner.css';
import {motion} from 'framer-motion';
const LastPartner = () => {
  return (
    <motion.div className='Lastpartners'
      initial={{ opacity: 0, x:-60 }}
      whileInView={{ opacity: 1, x:0 }}
      transition={{ duration: 3 }}
      viewport={{ once: false }}
    >
      <div className="containerBg2">
        <div className="container5_last">
          <b>
            Why Choose GoOn?
          </b>
          <p>
            GoOn is your trusted partner for safe, reliable, and affordable transportation. With a commitment to excellence and customer satisfaction.
            <br />
            <button
              type="button"
              title="searchrides"
            ><a href="https://apps.google.com" target='_blank'>
              Get the App
            </a>
            </button>
          </p>
        </div>
      </div>
    </motion.div>
  )
}

export default LastPartner;