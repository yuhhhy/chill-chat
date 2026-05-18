import React, { useContext } from "react";
import { assets } from "../../assets/assets";
import { Context } from "../../context/Context";

const WelcomeScreen = () => {
  const { onSent } = useContext(Context);

  return (
    <>
      <div className="greet">
        <p><span>hello, chill</span></p>
        <p>How can I help you?</p>
      </div>
      <div className="cards">
        <div className="card" onClick={() => onSent("建议一些即将自驾游时可以去的美丽景点")}>
          <p>建议一些即将自驾游时可以去的美丽景点</p>
          <img src={assets.compass_icon} alt="" />
        </div>
        <div className="card" onClick={() => onSent('简要总结一下"城市规划"这个概念')}>
          <p>简要总结一下"城市规划"这个概念</p>
          <img src={assets.bulb_icon} alt="" />
        </div>
        <div className="card" onClick={() => onSent("为我们的团队拓展活动集思广益")}>
          <p>为我们的团队拓展活动集思广益</p>
          <img src={assets.message_icon} alt="" />
        </div>
        <div className="card" onClick={() => onSent("提升以下代码的可读性")}>
          <p>提升以下代码的可读性</p>
          <img src={assets.code_icon} alt="" />
        </div>
      </div>
    </>
  );
};

export default WelcomeScreen;
