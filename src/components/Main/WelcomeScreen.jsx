import React, { useContext, useLayoutEffect, useRef, useState } from "react";
import { assets } from "../../assets/assets";
import { Context } from "../../context/Context";

const promptCards = [
  {
    text: "建议一些即将自驾游时可以去的美丽景点",
    icon: assets.compass_icon,
  },
  {
    text: '简要总结一下"城市规划"这个概念',
    icon: assets.bulb_icon,
  },
  {
    text: "为我们的团队拓展活动集思广益",
    icon: assets.message_icon,
  },
  {
    text: "提升以下代码的可读性",
    icon: assets.code_icon,
  },
];

const WelcomeScreen = () => {
  const { onSent } = useContext(Context);
  const cardsRef = useRef(null);
  const [visibleCardCount, setVisibleCardCount] = useState(promptCards.length);

  useLayoutEffect(() => {
    const cardsElement = cardsRef.current;
    if (!cardsElement) return undefined;

    const updateVisibleCards = () => {
      const styles = window.getComputedStyle(cardsElement);
      const paddingLeft = parseFloat(styles.paddingLeft) || 0;
      const paddingRight = parseFloat(styles.paddingRight) || 0;
      const columnGap = parseFloat(styles.columnGap) || 0;
      const minCardWidth = parseFloat(styles.getPropertyValue("--prompt-card-min-width")) || 190;
      const availableWidth = cardsElement.clientWidth - paddingLeft - paddingRight;
      const nextCount = Math.max(
        1,
        Math.min(
          promptCards.length,
          Math.floor((availableWidth + columnGap) / (minCardWidth + columnGap))
        )
      );

      setVisibleCardCount(nextCount);
    };

    updateVisibleCards();
    const observer = new ResizeObserver(updateVisibleCards);
    observer.observe(cardsElement);

    return () => observer.disconnect();
  }, []);

  return (
    <>
      <div className="greet">
        <p><span>hello, chill</span></p>
        <p>How can I help you?</p>
      </div>
      <div
        className="cards"
        ref={cardsRef}
        style={{ "--visible-card-count": visibleCardCount }}
      >
        {promptCards.slice(0, visibleCardCount).map((card) => (
          <div className="card" key={card.text} onClick={() => onSent(card.text)}>
            <p>{card.text}</p>
            <img src={card.icon} alt="" />
          </div>
        ))}
      </div>
    </>
  );
};

export default WelcomeScreen;
