import classNames from 'classnames';

import { Button, ButtonProps } from '@mui/material';

import { useStyles } from './buttonStyle';

const StyledButton = (props: ButtonProps) => {
  const { classes } = useStyles();

  return (
    <Button {...props} className={classNames(classes.input, props.className)} />
  );
};

export default StyledButton;
