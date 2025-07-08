import { ReactElement } from 'react';

import { IconButton, IconButtonProps } from '@mui/material';

interface IStyledIconButton extends IconButtonProps {
  children: ReactElement;
}

const StyledIconButton = (props: IStyledIconButton) => {
  const { children, className, size = 'small', onClick, ...restProps } = props;

  return (
    <IconButton
      className={className}
      size={size}
      onClick={onClick}
      {...restProps}
    >
      {children}
    </IconButton>
  );
};

export default StyledIconButton;
