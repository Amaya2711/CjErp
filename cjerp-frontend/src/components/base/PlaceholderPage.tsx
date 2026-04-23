import React from "react";
import styles from "./PlaceholderPage.module.css";

interface PlaceholderPageProps {
  title: string;
  children?: React.ReactNode;
}

const PlaceholderPage: React.FC<PlaceholderPageProps> = ({ title, children }) => (
  <div className={styles.placeholderPage}>
    <h1>{title}</h1>
    {children}
  </div>
);

export default PlaceholderPage;
