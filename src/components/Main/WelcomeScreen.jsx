import React, { useContext, useLayoutEffect, useRef, useState } from "react";
import { Context } from "../../context/Context";

const CARD_ICON_STROKE_WIDTH = 1.9;

const PromptIcon = ({ type }) => {
  const iconProps = {
    className: "card-icon",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: CARD_ICON_STROKE_WIDTH,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true",
  };

  switch (type) {
    case "compass":
      return (
        <svg {...iconProps}>
          <circle cx="12" cy="12" r="9" />
          <path d="m15.5 8.5-2.1 4.9-4.9 2.1 2.1-4.9 4.9-2.1Z" />
        </svg>
      );
    case "bulb":
      return (
        <svg {...iconProps}>
          <path d="M9 18h6" />
          <path d="M10 22h4" />
          <path d="M8.6 15.5a6 6 0 1 1 6.8 0c-.8.5-1.4 1.3-1.4 2.2h-4c0-.9-.6-1.7-1.4-2.2Z" />
        </svg>
      );
    case "message":
      return (
        <svg {...iconProps}>
          <path d="M21 11.5a8.4 8.4 0 0 1-9 8.3 8.8 8.8 0 0 1-3.9-.9L3 20l1.1-4.2A8.2 8.2 0 0 1 3 11.5 8.5 8.5 0 0 1 12 3a8.5 8.5 0 0 1 9 8.5Z" />
          <path d="M8.5 11h7" />
          <path d="M8.5 14h4.2" />
        </svg>
      );
    case "code":
      return (
        <svg {...iconProps}>
          <path d="m8 8-4 4 4 4" />
          <path d="m16 8 4 4-4 4" />
          <path d="m14 5-4 14" />
        </svg>
      );
    default:
      return null;
  }
};

const promptCards = [
  {
    text: "建议一些即将自驾游时可以去的美丽景点",
    icon: "compass",
  },
  {
    text: '简要总结一下"城市规划"这个概念',
    icon: "bulb",
  },
  {
    text: "为我们的团队拓展活动集思广益",
    icon: "message",
  },
  {
    text: "提升以下代码的可读性",
    icon: "code",
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
            <PromptIcon type={card.icon} />
          </div>
        ))}
      </div>
    </>
  );
};

export default WelcomeScreen;
